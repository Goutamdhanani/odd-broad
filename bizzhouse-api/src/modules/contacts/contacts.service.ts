import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { normalizePhone } from '../../shared/phone.util';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
  ) {}

  /**
   * Serialize contacts to CSV. Values that start with a formula character
   * (= + - @ tab CR) are prefixed with ' so Excel does not execute them —
   * contact names are user-controlled text imported from arbitrary CSVs.
   */
  buildCsv(rows: Array<Pick<Contact, 'name' | 'waId' | 'optedIn' | 'tags'>>): string {
    const esc = (v: string): string => {
      let s = v ?? '';
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
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

  async bulkImport(
    shopId: string,
    items: Array<{ waId: string; name?: string; tags?: string[] }>,
  ) {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of items) {
      const normalizedWaId = normalizePhone(item.waId || '');
      if (!normalizedWaId || normalizedWaId.length < 10) {
        skipped++;
        continue;
      }

      let contact = await this.contactRepo.findOne({
        where: { shopId, waId: normalizedWaId },
      });

      if (!contact) {
        contact = this.contactRepo.create({
          shopId,
          waId: normalizedWaId,
          name: item.name || undefined,
          tags: item.tags || [],
          optedIn: true,
          optedInAt: new Date(),
        });
        await this.contactRepo.save(contact);
        created++;
      } else {
        if (item.name) contact.name = item.name;
        if (item.tags?.length) {
          contact.tags = Array.from(new Set([...(contact.tags || []), ...item.tags]));
        }
        if (!contact.optedIn) {
          contact.optedIn = true;
          contact.optedInAt = new Date();
        }
        await this.contactRepo.save(contact);
        updated++;
      }
    }

    return {
      totalSubmitted: items.length,
      created,
      updated,
      skipped,
    };
  }
}
