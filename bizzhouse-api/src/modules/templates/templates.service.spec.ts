import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplatesService } from './templates.service';
import { TemplateStatus } from './entities/template.entity';

describe('TemplatesService.applyStatusCallback', () => {
  let service: TemplatesService;
  let mockTemplateRepo: any;
  let mockGupshupAppRepo: any;
  let mockGupshupService: any;

  const makeTpl = (over: Partial<any> = {}) => ({
    id: 'tpl-1',
    shopId: 'shop-1',
    elementName: 'order_update',
    status: TemplateStatus.IN_REVIEW,
    rejectionReason: null as string | null,
    save: undefined,
    ...over,
  });

  beforeEach(() => {
    mockTemplateRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      save: vi.fn(async (t: any) => t),
    };
    mockGupshupAppRepo = {
      findOne: vi.fn().mockResolvedValue({ shopId: 'shop-1' }),
    };
    mockGupshupService = {};

    service = new TemplatesService(
      mockTemplateRepo,
      mockGupshupAppRepo,
      mockGupshupService,
    );
  });

  it('maps APPROVED and clears rejection reason', async () => {
    const tpl = makeTpl({ gupshupTemplateId: 'gtpl-9' });
    mockTemplateRepo.find.mockResolvedValue([tpl]);

    const result = await service.applyStatusCallback({
      gupshupTemplateId: 'gtpl-9',
      status: 'APPROVED',
    });

    expect(result).toBe(true);
    expect(tpl.status).toBe(TemplateStatus.APPROVED);
    expect(tpl.rejectionReason).toBeNull();
    expect(mockTemplateRepo.save).toHaveBeenCalledWith(tpl);
  });

  it('maps REJECTED and stores the reason', async () => {
    const tpl = makeTpl();
    mockTemplateRepo.find.mockResolvedValue([tpl]);

    const result = await service.applyStatusCallback({
      gupshupTemplateId: 'gtpl-9',
      status: 'rejected',
      rejectionReason: 'Content violates commerce policy',
    });

    expect(result).toBe(true);
    expect(tpl.status).toBe(TemplateStatus.REJECTED);
    expect(tpl.rejectionReason).toBe('Content violates commerce policy');
  });

  it('normalizes IN_REVIEW variants', async () => {
    const tpl = makeTpl();
    mockTemplateRepo.find.mockResolvedValue([tpl]);

    await service.applyStatusCallback({
      gupshupTemplateId: 'gtpl-9',
      status: 'PENDING',
    });

    expect(tpl.status).toBe(TemplateStatus.IN_REVIEW);
  });

  it('falls back to app+elementName lookup when no template id', async () => {
    const tpl = makeTpl();
    mockTemplateRepo.find.mockResolvedValue([]);
    mockTemplateRepo.findOne.mockResolvedValue(tpl);

    const result = await service.applyStatusCallback({
      gupshupAppId: 'gs-app-1',
      elementName: 'order_update',
      status: 'APPROVED',
    });

    expect(mockGupshupAppRepo.findOne).toHaveBeenCalledWith({
      where: { gupshupAppId: 'gs-app-1' },
    });
    expect(mockTemplateRepo.findOne).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', elementName: 'order_update' },
    });
    expect(result).toBe(true);
    expect(tpl.status).toBe(TemplateStatus.APPROVED);
  });

  it('returns false for unmapped statuses', async () => {
    const result = await service.applyStatusCallback({
      gupshupTemplateId: 'gtpl-9',
      status: 'SOMETHING_WEIRD',
    });
    expect(result).toBe(false);
  });

  it('returns false when nothing matches and does not save', async () => {
    mockTemplateRepo.find.mockResolvedValue([]);
    mockTemplateRepo.findOne.mockResolvedValue(null);

    const result = await service.applyStatusCallback({
      gupshupAppId: 'gs-app-1',
      elementName: 'ghost',
      status: 'APPROVED',
    });

    expect(result).toBe(false);
    expect(mockTemplateRepo.save).not.toHaveBeenCalled();
  });
});
