import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { normalizePhone } from '../../shared/phone.util';
import { escapeCsvValue } from '../../shared/csv';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
  ) {}

  /**
   * Serialize contacts to CSV. Values that start with a formula character
   * (= + - @ tab CR) are neutralized by the shared escaper so Excel does
   * not execute them — contact names are user-controlled text.
   */
  buildCsv(rows: Array<Pick<Contact, 'name' | 'waId' | 'optedIn' | 'tags'>>): string {
    const esc = escapeCsvValue;
    const header = ['name', 'wa_id', 'opted_in', 'tags'];
    const lines = rows.map((r) =>
      [
        esc(r.name ?? ''),
        esc(r.waId),
        r.optedIn ? 'yes' : 'no',
        esc((r.tags ?? []).join(';')),
      ].join(','),
    );
    return [header.join(','), ...lines].join('\r\n');
  }

  /** Export the SAME filters the list view uses, unpaginated. */
  async exportCsv(shopId: string, search?: string, tag?: string): Promise<string> {
    const qb = this.contactRepo
      .createQueryBuilder('contact')
      .where('contact.shopId = :shopId', { shopId })
      .orderBy('contact.name', 'ASC')
      .addOrderBy('contact.waId', 'ASC');

    if (search) {
      qb.andWhere('(contact.name ILIKE :search OR contact.wa_id ILIKE :search)', {
        search: `%${search}%`,
      });
    }
    if (tag) {
      qb.andWhere(':tag = ANY(contact.tags)', { tag });
    }

    return this.buildCsv(await qb.getMany());
  }

  async findAll(
    shopId: string,
    page = 1,
    limit = 30,
    search?: string,
    tag?: string,
  ) {
    const queryBuilder = this.contactRepo.createQueryBuilder('contact')
      .where('contact.shopId = :shopId', { shopId })
      .orderBy('contact.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      queryBuilder.andWhere(
        '(contact.name ILIKE :search OR contact.wa_id ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (tag) {
      queryBuilder.andWhere(':tag = ANY(contact.tags)', { tag });
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findById(shopId: string, id: string) {
    const contact = await this.contactRepo.findOne({
      where: { id, shopId },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async create(
    shopId: string,
    dto: { waId: string; name?: string; tags?: string[] },
  ) {
    const existing = await this.contactRepo.findOne({
      where: { shopId, waId: dto.waId },
    });
    if (existing) {
      throw new ConflictException('Contact with this WhatsApp number already exists');
    }

    const contact = this.contactRepo.create({
      shopId,
      waId: dto.waId,
      name: dto.name || undefined,
      tags: dto.tags || [],
      optedIn: false,
    });
    return this.contactRepo.save(contact);
  }

  async update(
    shopId: string,
    id: string,
    dto: { name?: string; tags?: string[]; optedIn?: boolean },
  ) {
    const contact = await this.findById(shopId, id);
    Object.assign(contact, dto);
    // Meta policy audit trail: record WHEN consent was given/taken away.
    if (dto.optedIn === true && !contact.optedInAt) {
      contact.optedInAt = new Date();
    } else if (dto.optedIn === false) {
      contact.optedInAt = null;
    }
    return this.contactRepo.save(contact);
  }

  async resolveContact(
    shopId: string,
    waId: string,
    name?: string,
  ): Promise<Contact> {
    let contact = await this.contactRepo.findOne({
      where: { shopId, waId },
    });
    if (!contact) {
      contact = this.contactRepo.create({
        shopId,
        waId,
        name: name || undefined,
        optedIn: false,
      });
      contact = await this.contactRepo.save(contact);
    }
    return contact;
  }

  /**
   * Bulk CSV import, batched: instead of a findOne + save per row (2
   * queries × 5000 rows on the shop's very first onboarding step), the
   * whole import costs ~1 SELECT per 500 rows + one INSERT batch.
   * Semantics preserved: invalid numbers skipped, new rows auto-opted-in
   * with consent timestamp, existing rows merge name/tags and gain consent,
   * duplicate numbers inside the batch merge into the first row.
   */
  async bulkImport(
    shopId: string,
    items: Array<{ waId: string; name?: string; tags?: string[] }>,
  ) {
    let skipped = 0;
    let created = 0;
    let updated = 0;

    // Normalize + drop invalid; first occurrence of a repeated waId wins
    const byWaId = new Map<string, { name?: string; tags: string[] }>();
    for (const item of items) {
      const waId = normalizePhone(item.waId || '');
      if (!waId || waId.length < 10) {
        skipped++;
        continue;
      }
      const acc = byWaId.get(waId);
      if (!acc) {
        byWaId.set(waId, { name: item.name, tags: [...(item.tags || [])] });
      } else {
        if (item.name) acc.name = item.name;
        acc.tags = Array.from(new Set([...acc.tags, ...(item.tags || [])]));
      }
    }

    if (byWaId.size === 0) {
      return { totalSubmitted: items.length, created, updated, skipped };
    }

    const waIds = [...byWaId.keys()];
    const CHUNK = 500;
    const existingByWaId = new Map<string, Contact>();

    for (let i = 0; i < waIds.length; i += CHUNK) {
      const chunk = waIds.slice(i, i + CHUNK);
      const found = await this.contactRepo.find({
        where: { shopId, waId: In(chunk) },
      });
      for (const c of found) existingByWaId.set(c.waId, c);
    }

    const newRows: Contact[] = [];
    const touched: Contact[] = [];

    for (const [waId, data] of byWaId) {
      const existing = existingByWaId.get(waId);
      if (!existing) {
        newRows.push(
          this.contactRepo.create({
            shopId,
            waId,
            name: data.name || undefined,
            tags: data.tags,
            optedIn: true,
            optedInAt: new Date(),
          }),
        );
        created++;
      } else {
        let changed = false;
        if (data.name && data.name !== existing.name) {
          existing.name = data.name;
          changed = true;
        }
        if (data.tags.length) {
          const merged = Array.from(new Set([...(existing.tags || []), ...data.tags]));
          if (merged.length !== (existing.tags || []).length) {
            existing.tags = merged;
            changed = true;
          }
        }
        if (!existing.optedIn) {
          existing.optedIn = true;
          existing.optedInAt = new Date();
          changed = true;
        }
        if (changed) touched.push(existing);
        updated++;
      }
    }

    // save(array) batch-writes in one INSERT; unchanged-existing rows were
    // filtered out so we never issue pointless UPDATEs.
    if (newRows.length > 0) await this.contactRepo.save(newRows);
    if (touched.length > 0) await this.contactRepo.save(touched);

    return { totalSubmitted: items.length, created, updated, skipped };
  }
}
