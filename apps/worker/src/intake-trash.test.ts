import { describe, expect, it, vi } from "vitest";

import { purgeExpiredIntakeTrash } from "./intake-trash.ts";

describe("purgeExpiredIntakeTrash", () => {
  it("reports only material purge work without exposing source content", async () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const store = {
      purgeExpiredIntakeDrafts: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0),
    };
    const logger = { info: vi.fn() };
    await expect(purgeExpiredIntakeTrash(store as never, logger as never, now)).resolves.toBe(2);
    await expect(purgeExpiredIntakeTrash(store as never, logger as never, now)).resolves.toBe(0);
    expect(store.purgeExpiredIntakeDrafts).toHaveBeenCalledWith(now);
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith({ purgedCount: 2 }, "expired intake trash purged");
  });
});
