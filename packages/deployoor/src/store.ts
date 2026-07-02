import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DeploymentRecord } from "./schemas";

// Deployment files are vanilla JSON (portable + greppable, committed to the user's
// repo). The only non-JSON value is bigint in `constructorArgs`; we stringify it on
// write (standard replacer) and read it back as a string — we never need to revive
// the bigint type (idempotency uses the address; verification re-encodes from the ABI).
const bigintReplacer = (_key: string, value: unknown): unknown =>
  typeof value === "bigint" ? value.toString() : value;

/**
 * Public store extension point. Plain (sync-or-async), no Effect — the engine
 * lifts it internally. Write a custom backend (DB, remote) by implementing this.
 */
export interface StoreAdapter {
  read: (network: string, name: string) => Awaitable<DeploymentRecord | null>;
  write: (record: DeploymentRecord) => Awaitable<void>;
  list: (network: string) => Awaitable<ReadonlyArray<DeploymentRecord>>;
  remove: (network: string, name: string) => Awaitable<void>;
  /**
   * Optional coarse lock for stores that can guard read→deploy→write.
   * Implementations should return a release function. Stores that omit it remain valid.
   */
  lock?: (network: string, name: string) => Awaitable<() => Awaitable<void>>;
}

type Awaitable<T> = T | Promise<T>;

export interface ChainIdentity {
  readonly id: number;
  readonly name: string;
}

export const networkSlug = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "chain";
};

export const networkKeyForChain = (chain: ChainIdentity): string => `${chain.id}-${networkSlug(chain.name)}`;

const key = (network: string, name: string): string => `${network.toLowerCase()}/${name}`;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const assertSafeSegment = (value: string, label: string): void => {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("..") ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new Error(`${label} cannot be empty, contain path separators, or contain "..": ${value}`);
  }
};

/** In-memory store. Hermetic — used by tests and ephemeral runs. */
export const memoryStore = (seed: ReadonlyArray<DeploymentRecord> = []): StoreAdapter => {
  const map = new Map<string, DeploymentRecord>(seed.map((r) => [key(r.networkName, r.deploymentName), r]));
  return {
    read: (network, name) => map.get(key(network, name)) ?? null,
    write: (record) => {
      map.set(key(record.networkName, record.deploymentName), record);
    },
    list: (network) =>
      Array.from(map.values()).filter((r) => r.networkName.toLowerCase() === network.toLowerCase()),
    remove: (network, name) => {
      map.delete(key(network, name));
    },
  };
};

/** Filesystem store rooted at an absolute path. Owns the bigint-safe JSON. */
export const fsStore = (root: string): StoreAdapter => {
  const dirFor = (network: string): string => {
    assertSafeSegment(network, "network");
    return join(root, network.toLowerCase());
  };
  const fileFor = (network: string, name: string): string => {
    assertSafeSegment(name, "deploymentName");
    return join(dirFor(network), `${name}.json`);
  };
  const readFile = (file: string): DeploymentRecord =>
    DeploymentRecord.parse(JSON.parse(readFileSync(file, "utf8")));
  const readFileSafe = (file: string): DeploymentRecord | null => {
    try {
      return readFile(file);
    } catch {
      return null;
    }
  };
  const acquireLock = async (network: string, name: string, attempts = 600): Promise<() => void> => {
    const dir = dirFor(network);
    mkdirSync(dir, { recursive: true });
    assertSafeSegment(name, "deploymentName");
    const lock = join(dir, `.${name}.lock`);
    const tryAcquire = async (remaining: number): Promise<() => void> => {
      try {
        const fd = openSync(lock, "wx");
        closeSync(fd);
        return () => rmSync(lock, { force: true });
      } catch (cause) {
        if (
          cause instanceof Error &&
          "code" in cause &&
          cause.code === "EEXIST" &&
          Date.now() - statSync(lock).mtimeMs > 5 * 60 * 1000
        ) {
          rmSync(lock, { force: true });
          return tryAcquire(remaining);
        }
        if (remaining <= 0) throw new Error(`Timed out waiting for deployment lock ${network}/${name}`);
        await sleep(50);
        return tryAcquire(remaining - 1);
      }
    };
    return tryAcquire(attempts);
  };

  return {
    read: (network, name) => {
      const file = fileFor(network, name);
      return existsSync(file) ? readFile(file) : null;
    },
    write: (record) => {
      const dir = dirFor(record.networkName);
      mkdirSync(dir, { recursive: true });
      assertSafeSegment(record.deploymentName, "deploymentName");
      const file = join(dir, `${record.deploymentName}.json`);
      const tmp = join(dir, `.${record.deploymentName}.${randomUUID()}.tmp`);
      writeFileSync(tmp, JSON.stringify(record, bigintReplacer, 2));
      renameSync(tmp, file);
    },
    list: (network) => {
      const dir = dirFor(network);
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .flatMap((f) => {
          const record = readFileSafe(join(dir, f));
          return record === null ? [] : [record];
        });
    },
    remove: (network, name) => {
      const file = fileFor(network, name);
      if (existsSync(file)) rmSync(file);
    },
    lock: acquireLock,
  };
};
