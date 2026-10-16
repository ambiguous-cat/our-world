import "server-only";

type LoginRateLimitState = {
  failures: number[];
  blockedUntil: number;
};

type LoginRateLimitConfig = {
  maximumFailures: number;
  windowMs: number;
  lockMs: number;
};

type LoginRateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

const DEFAULT_MAXIMUM_FAILURES = 5;
const DEFAULT_WINDOW_SECONDS = 10 * 60;
const DEFAULT_LOCK_SECONDS = 15 * 60;

const globalWithLoginRateLimit = globalThis as typeof globalThis & {
  ourWorldLoginRateLimitState?: LoginRateLimitState;
};

const state =
  globalWithLoginRateLimit.ourWorldLoginRateLimitState ??
  {
    failures: [],
    blockedUntil: 0,
  };

globalWithLoginRateLimit.ourWorldLoginRateLimitState = state;

function positiveIntegerEnvironmentValue(
  name: string,
  fallback: number,
) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }

  return value;
}

function loginRateLimitConfig(): LoginRateLimitConfig {
  return {
    maximumFailures: positiveIntegerEnvironmentValue(
      "AUTH_LOGIN_RATE_LIMIT_MAX_FAILURES",
      DEFAULT_MAXIMUM_FAILURES,
    ),
    windowMs:
      positiveIntegerEnvironmentValue(
        "AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS",
        DEFAULT_WINDOW_SECONDS,
      ) * 1000,
    lockMs:
      positiveIntegerEnvironmentValue(
        "AUTH_LOGIN_RATE_LIMIT_LOCK_SECONDS",
        DEFAULT_LOCK_SECONDS,
      ) * 1000,
  };
}

function resetExpiredLock(now: number) {
  if (state.blockedUntil !== 0 && state.blockedUntil <= now) {
    state.blockedUntil = 0;
    state.failures = [];
  }
}

function pruneFailures(now: number, windowMs: number) {
  const windowStart = now - windowMs;
  state.failures = state.failures.filter(
    (timestamp) => timestamp > windowStart,
  );
}

function currentLimit(now: number): LoginRateLimitResult {
  if (state.blockedUntil <= now) return { limited: false };

  return {
    limited: true,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((state.blockedUntil - now) / 1000),
    ),
  };
}

export function checkLoginRateLimit(
  now = Date.now(),
): LoginRateLimitResult {
  resetExpiredLock(now);
  return currentLimit(now);
}

export function recordLoginFailure(
  now = Date.now(),
): LoginRateLimitResult {
  const config = loginRateLimitConfig();
  resetExpiredLock(now);
  pruneFailures(now, config.windowMs);
  state.failures.push(now);

  if (state.failures.length >= config.maximumFailures) {
    state.failures = [];
    state.blockedUntil = now + config.lockMs;
  }

  return currentLimit(now);
}

export function clearLoginFailures() {
  if (state.blockedUntil === 0) {
    state.failures = [];
  }
}
