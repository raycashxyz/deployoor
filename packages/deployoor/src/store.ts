import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
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
}

type Awaitable<T> = T | Promise<T>;

const key = (network: string, name: string): string => `${network.toLowerCase()}/${name}`;

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
  const fileFor = (network: string, name: string): string =>
    join(root, network.toLowerCase(), `${name}.json`);
  const readFile = (file: string): DeploymentRecord =>
    DeploymentRecord.parse(JSON.parse(readFileSync(file, "utf8")));

  return {
    read: (network, name) => {
      const file = fileFor(network, name);
      return existsSync(file) ? readFile(file) : null;
    },
    write: (record) => {
      const dir = join(root, record.networkName.toLowerCase());
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${record.deploymentName}.json`), JSON.stringify(record, bigintReplacer, 2));
    },
    list: (network) => {
      const dir = join(root, network.toLowerCase());
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => readFile(join(dir, f)));
    },
    remove: (network, name) => {
      const file = fileFor(network, name);
      if (existsSync(file)) rmSync(file);
    },
  };
};
