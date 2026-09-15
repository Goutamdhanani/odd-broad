import { describe, it, expect, beforeEach } from 'vitest';
import { ContactsService } from './contacts.service';

describe('ContactsService.buildCsv', () => {
  let service: ContactsService;

  beforeEach(() => {
    service = new ContactsService({} as any);
  });

  it('renders a header and one line per contact', () => {
    const csv = service.buildCsv([
      { name: 'Pooja Sharma', waId: '919876543211', optedIn: true, tags: ['vip'] },
      { name: 'Rahul', waId: '919876543212', optedIn: false, tags: [] } as any,
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('name,wa_id,opted_in,tags');
    expect(lines[1]).toBe('"Pooja Sharma","919876543211",yes,"vip"');
    expect(lines[2]).toBe('"Rahul","919876543212",no,""');
  });

  it('neutralizes formula injection via leading-character prefix', () => {
    const csv = service.buildCsv([
      { name: '=cmd|\'/C calc\'!A0', waId: '919999999999', optedIn: true, tags: ['+SUM(1,1)'] },
    ]);
    const line = csv.split('\r\n')[1];
    expect(line.startsWith('"\'=cmd')).toBe(true);
    expect(line).toContain('"\'+SUM(1,1)"');
  });

  it('escapes embedded quotes by doubling them', () => {
    const csv = service.buildCsv([
      { name: 'Priya "Boutique" Silks', waId: '919876543210', optedIn: true, tags: [] },
    ]);
    expect(csv).toContain('"Priya ""Boutique"" Silks"');
  });

  it('handles missing name and tags', () => {
    const csv = service.buildCsv([
      { name: undefined as any, waId: '919876543210', optedIn: false, tags: undefined as any },
    ]);
    expect(csv.split('\r\n')[1]).toBe('"","919876543210",no,""');
  });
});

describe('ContactsService.bulkImport (batched)', () => {
  let mockRepo: any;
  let service: ContactsService;

  beforeEach(() => {
    mockRepo = {
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((data) => ({ id: `new-${data.waId}`, ...data })),
      save: vi.fn(async (arg) => arg),
    };
    service = new ContactsService(mockRepo);
  });

  it('inserts all-new rows in one batched save (no per-row findOne)', async () => {
    const res = await service.bulkImport('shop-1', [
      { waId: '919876543211', name: 'A', tags: ['vip'] },
      { waId: '919876543212', name: 'B' },
      { waId: '919876543213', name: 'C', tags: ['new'] },
    ]);

    expect(res).toMatchObject({ totalSubmitted: 3, created: 3, updated: 0, skipped: 0 });
    // one chunk SELECT + one INSERT batch — not 6 round-trips
    expect(mockRepo.find).toHaveBeenCalledTimes(1);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    const saved = mockRepo.save.mock.calls[0][0];
    expect(Array.isArray(saved) && saved.length).toBe(3);
    expect(saved[0]).toMatchObject({ optedIn: true, tags: ['vip'] });
  });

  it('merges into existing rows and counts them as updated', async () => {
    const existing = {
      id: 'c-1',
      shopId: 'shop-1',
      waId: '919876543211',
      name: 'Old',
      tags: ['old'],
      optedIn: false,
      optedInAt: null,
    };
    mockRepo.find.mockResolvedValue([existing]);

    const res = await service.bulkImport('shop-1', [
      { waId: '919876543211', name: 'New Name', tags: ['vip'] },
    ]);

    expect(res).toMatchObject({ created: 0, updated: 1 });
    expect(existing).toMatchObject({ name: 'New Name', optedIn: true });
    expect(existing.tags.sort()).toEqual(['old', 'vip']);
    expect(existing.optedInAt).toBeInstanceOf(Date);
  });

  it('skips invalid numbers and dedupes the same waId inside one batch', async () => {
    const res = await service.bulkImport('shop-1', [
      { waId: '123' }, // too short → skipped
      { waId: '919876543211', name: 'First', tags: ['a'] },
      { waId: '09876543211', tags: ['b'] }, // same number after trunk-0 strip → merged
    ]);

    expect(res).toMatchObject({ totalSubmitted: 3, created: 1, skipped: 1 });
    const saved = mockRepo.save.mock.calls[0][0];
    expect(saved[0]).toMatchObject({ waId: '919876543211', name: 'First' });
    expect(saved[0].tags).toEqual(['a', 'b']);
  });

  it('does not UPDATE rows that need no change', async () => {
    const unchanged = {
      id: 'c-1',
      shopId: 'shop-1',
      waId: '919876543211',
      name: 'Same',
      tags: ['x'],
      optedIn: true,
      optedInAt: new Date(),
    };
    mockRepo.find.mockResolvedValue([unchanged]);

    const res = await service.bulkImport('shop-1', [
      { waId: '919876543211', name: 'Same', tags: ['x'] },
    ]);

    expect(res.updated).toBe(1);
    expect(mockRepo.save).not.toHaveBeenCalled(); // nothing touched
  });
});
