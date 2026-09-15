import { describe, it, expect, beforeEach, vi } from 'vitest';
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
