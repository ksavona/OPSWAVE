import { RateLimiterMemory, RateLimiterPostgres, type RateLimiterRes } from "rate-limiter-flexible";

import { getStore } from "./runtime";

export interface RateLimitGate {
  consumeAccount(signal: string): Promise<void>;
  consumeNetwork(signal: string): Promise<void>;
  consumeSensitive(signal: string): Promise<void>;
  resetAccount(signal: string): Promise<void>;
}

class RateLimitRejection extends Error {
  public constructor(public readonly retryAfterSeconds: number) {
    super("The request rate limit was exceeded.");
    this.name = "RateLimitRejection";
  }
}

const retryError = (error: unknown): RateLimitRejection => {
  const result = error as Partial<RateLimiterRes>;
  return new RateLimitRejection(Math.max(1, Math.ceil((result.msBeforeNext ?? 1_000) / 1_000)));
};

export const createRateLimitGate = (): RateLimitGate => {
  const pool = getStore().pool;
  const fallback = new RateLimiterMemory({ duration: 15 * 60, points: 3 });
  const common = {
    clearExpiredByTimeout: false,
    schemaName: "opsweave",
    storeClient: pool,
    storeType: "pool",
    tableCreated: true,
    tableName: "rate_limit_counters",
  } as const;
  const account = new RateLimiterPostgres({
    ...common,
    blockDuration: 15 * 60,
    duration: 15 * 60,
    insuranceLimiter: fallback,
    keyPrefix: "login-account",
    points: 5,
  });
  const network = new RateLimiterPostgres({
    ...common,
    blockDuration: 15 * 60,
    duration: 15 * 60,
    insuranceLimiter: fallback,
    keyPrefix: "login-network",
    points: 20,
  });
  const sensitive = new RateLimiterPostgres({
    ...common,
    blockDuration: 10 * 60,
    duration: 10 * 60,
    keyPrefix: "sensitive",
    points: 5,
  });

  const consume = async (limiter: RateLimiterPostgres, signal: string) => {
    try {
      await limiter.consume(signal);
    } catch (error) {
      throw retryError(error);
    }
  };

  return {
    consumeAccount: async (signal) => consume(account, signal),
    consumeNetwork: async (signal) => consume(network, signal),
    consumeSensitive: async (signal) => consume(sensitive, signal),
    resetAccount: async (signal) => {
      await account.delete(signal);
    },
  };
};
