import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CronTasksService } from './cron-tasks.service';

describe('CronTasksService.pruneWebhookEvents', () => {
  let service: CronTasksService;
  let mockWebhookRepo: any;
  let retentionDays: number;

  const anyRepo = () => ({ find: vi.fn().mockResolvedValue([]), query: vi.fn().mockResolvedValue([]) });

  beforeEach(() => {
    mockWebhookRepo = { delete: vi.fn().mockResolvedValue({ affected: 3 }) };
    retentionDays = 7;
    service = new CronTasksService(
      anyRepo(),
      anyRepo(),
      mockWebhookRepo,
      {},
      {},
      {},
      { raise: vi.fn() },
      { get: vi.fn(() => retentionDays) } as any,
    );
  });

  it('deletes only PROCESSED events older than the retention cutoff', async () => {
    const before = Date.now();
    const removed = await service.pruneWebhookEvents();
    expect(removed).toBe(3);

    const arg = mockWebhookRepo.delete.mock.calls[0][0];
    expect(arg.processed).toBe(true);
    // LessThan(Date) where the Date is ~7 days back
    expect(arg.receivedAt).toBeInstanceOf(Object);
    const cutoff: Date = arg.receivedAt._value ?? arg.receivedAt.value;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 7 * 86_400_000 - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now() - 7 * 86_400_000 + 1000);
  });

  it('uses the configured retention window', async () => {
    retentionDays = 30;
    await service.pruneWebhookEvents();
    const arg = mockWebhookRepo.delete.mock.calls[0][0];
    const cutoff: Date = arg.receivedAt._value ?? arg.receivedAt.value;
    const age = Date.now() - cutoff.getTime();
    expect(age).toBeGreaterThanOrEqual(29 * 86_400_000);
    expect(age).toBeLessThanOrEqual(31 * 86_400_000);
  });

  it('disables pruning for a zero/negative retention setting', async () => {
    retentionDays = 0;
    await expect(service.pruneWebhookEvents()).resolves.toBe(0);
    expect(mockWebhookRepo.delete).not.toHaveBeenCalled();

    retentionDays = -1;
    await expect(service.pruneWebhookEvents()).resolves.toBe(0);
    expect(mockWebhookRepo.delete).not.toHaveBeenCalled();
  });

  it('never throws to the cron when the delete fails', async () => {
    mockWebhookRepo.delete.mockRejectedValue(new Error('db down'));
    await expect(service.pruneWebhookEvents()).resolves.toBe(0);
  });

  it('returns 0 when nothing matched', async () => {
    mockWebhookRepo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.pruneWebhookEvents()).resolves.toBe(0);
  });
});
