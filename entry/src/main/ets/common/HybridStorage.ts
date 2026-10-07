/*
 * Rule-11 PORT of Cache 6.0.0's storage stack (plan port `port_cache`), from the vendored pod
 * source at input/source/OutRun-1.3/Pods/Cache/Source/Shared:
 *   - Storage/HybridStorage.swift  -> HybridStorage (memory first, write through to disk)
 *   - Storage/MemoryStorage.swift  -> MemoryStorage (+ MemoryCapsule's expiry stamp)
 *   - Storage/DiskStorage.swift    -> DiskStorage (+ its file naming and size trimming)
 *   - Storage/StorageAware.swift   -> the object/entry/exists/remove surface
 *   - Configuration/{DiskConfig,MemoryConfig,Expiry}.swift -> the two configs and Expiry
 * plus the app's own `DiskStorage` extension (OutRun/Extensions/DiskStorage.swift:24-46) that adds
 * `directoryURL`/`totalSize`, and `FileManager.sizeOfDirectory` behind it.
 *
 * The one consumer is common/CustomImageCache.ts (the rendered workout-map images), and the Debug
 * screen surfaces exactly two things off it: the total disk size and "Clear Cache" — so `diskSize`
 * and `removeAll` are part of the contract, not incidental.
 *
 * CAPABILITY MAPPING (Rule 10), three places where the target is not a like-for-like:
 *  - `NSCache` -> `util.LRUCache`, which is the same least-recently-used count-limited cache, so
 *    `MemoryConfig.countLimit` carries over directly. `totalCostLimit` does NOT: LRUCache has no
 *    per-entry cost, and the one call site passes 0 (no limit), so nothing is lost.
 *  - `FileManager` -> `@ohos.file.fs` under the app sandbox. The source stamped each file's
 *    MODIFICATION DATE with its expiry date and read expiry back off the stamp; that works here too
 *    (`fs.utimes` writes ms, `Stat.mtime` reads seconds), so the expiry survives a relaunch exactly
 *    as it did on iOS.
 *  - `MD5(key)` file names -> the key with anything outside [A-Za-z0-9._-] replaced. The only keys
 *    this cache ever sees are `WorkoutMapImageRequest.cacheIdentifier()` —
 *    "<uuid>_<list|stats>_<light|dark>" — which are already file-name safe, so hashing them would
 *    only cost a CryptoArchitectureKit round trip per lookup. Sanitising keeps names 1:1 with keys.
 *
 * The `Transformer<Value>` generic is DELIBERATELY out of scope. It existed so a library could store
 * any Codable type; this app has one value type, so the storage holds raw bytes and
 * common/CustomImageCache.ts does the PixelMap <-> bytes step. Also out of scope, with no call site:
 * the storage/key OBSERVER registries (`addStorageObserver`/`addObserver(forKey:)`,
 * `StorageChange`/`KeyChange`/`ObservationToken`), `transform()`, and the async/Combine wrappers.
 */
import { util } from '@kit.ArkTS';
import { fileIo as fs } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'HybridStorage';

/**
 * `fs.accessSync` is documented BOTH ways — it returns false for a missing path AND it can throw
 * 13900002 (no such file or directory). A throw propagating out of a read made the whole cache
 * answer "unknown" (null), which the Debug screen renders as the source's "-1 bytes" sentinel
 * even for a healthy empty cache. Both answers mean the same thing, so they are folded here,
 * once, for every caller.
 */
function pathExists(path: string): boolean {
  try {
    return fs.accessSync(path);
  } catch (err) {
    return false;
  }
}

/** Source: `Expiry` — `.never` is Foundation's distantFuture, which no clock reaches. */
export class Expiry {
  readonly date: Date;

  constructor(date: Date) {
    this.date = date;
  }

  /** Source: `Expiry.never`. */
  static never(): Expiry {
    return new Expiry(new Date(8640000000000000));
  }

  /** Source: `Expiry.seconds(TimeInterval)`. */
  static seconds(seconds: number): Expiry {
    return new Expiry(new Date(Date.now() + seconds * 1000));
  }

  /** Source: `Expiry.date(Date)`. */
  static at(date: Date): Expiry {
    return new Expiry(date);
  }

  /** Source: `Expiry.isExpired`. */
  isExpired(): boolean {
    return this.date.getTime() < Date.now();
  }
}

/** Source: `MemoryConfig`. `totalCostLimit` is not ported — see the capability-mapping note above. */
export class MemoryConfig {
  readonly expiry: Expiry;
  readonly countLimit: number;

  constructor(expiry: Expiry, countLimit: number) {
    this.expiry = expiry;
    this.countLimit = countLimit;
  }
}

/** Source: `DiskConfig`. `directory` is required here — only the ability can resolve the sandbox. */
export class DiskConfig {
  readonly name: string;
  readonly expiry: Expiry;
  /** Source: `maxSize` in bytes; 0 means no limit, as in the source. */
  readonly maxSize: number;
  readonly directory: string;

  constructor(name: string, expiry: Expiry, maxSize: number, directory: string) {
    this.name = name;
    this.expiry = expiry;
    this.maxSize = maxSize;
    this.directory = directory;
  }
}

/** Source: `Entry<Value>` — the object plus the metadata the expiry sweep reads. */
export class CacheEntry {
  readonly object: ArrayBuffer;
  readonly expiry: Expiry;
  readonly filePath: string | null;

  constructor(object: ArrayBuffer, expiry: Expiry, filePath: string | null) {
    this.object = object;
    this.expiry = expiry;
    this.filePath = filePath;
  }
}

/** Source: `MemoryCapsule` — the value with the expiry it was stored under. */
class MemoryCapsule {
  readonly object: ArrayBuffer;
  readonly expiry: Expiry;

  constructor(object: ArrayBuffer, expiry: Expiry) {
    this.object = object;
    this.expiry = expiry;
  }
}

/** Source: `MemoryStorage` — an LRU cache over `NSCache`, here over `util.LRUCache`. */
export class MemoryStorage {
  private readonly config: MemoryConfig;
  private readonly cache: util.LRUCache<string, MemoryCapsule>;
  /** Source: `keys` — LRUCache cannot enumerate, so the key set is tracked as the source does. */
  private readonly keys: Set<string> = new Set<string>();

  constructor(config: MemoryConfig) {
    this.config = config;
    this.cache = new util.LRUCache<string, MemoryCapsule>(
      config.countLimit > 0 ? config.countLimit : 64);
  }

  /** Source: `setObject(_:forKey:expiry:)`. */
  setObject(object: ArrayBuffer, key: string, expiry: Expiry | null = null): void {
    this.cache.put(key, new MemoryCapsule(object, expiry !== null ? expiry : this.config.expiry));
    this.keys.add(key);
  }

  /** Source: `entry(forKey:)` — null where the source throws `StorageError.notFound`. */
  entry(key: string): CacheEntry | null {
    const capsule: MemoryCapsule | undefined = this.cache.get(key);
    if (capsule === undefined) {
      return null;
    }
    return new CacheEntry(capsule.object, capsule.expiry, null);
  }

  /** Source: `removeObject(forKey:)`. */
  removeObject(key: string): void {
    this.cache.remove(key);
    this.keys.delete(key);
  }

  /** Source: `removeAll()`. */
  removeAll(): void {
    this.cache.clear();
    this.keys.clear();
  }

  /** Source: `removeObjectIfExpired(forKey:)`. */
  removeObjectIfExpired(key: string): void {
    const capsule: MemoryCapsule | undefined = this.cache.get(key);
    if (capsule !== undefined && capsule.expiry.isExpired()) {
      this.removeObject(key);
    }
  }

  /** Source: `removeExpiredObjects()`. */
  removeExpiredObjects(): void {
    const snapshot: string[] = [];
    for (const key of this.keys) {
      snapshot.push(key);
    }
    for (const key of snapshot) {
      this.removeObjectIfExpired(key);
    }
  }
}

/** One file in the cache directory, with what the expiry sweep and the size trim need. */
class DiskFile {
  readonly path: string;
  readonly size: number;
  /** The file's mtime, which IS its expiry stamp — see the class comment. */
  readonly expiryMillis: number;

  constructor(path: string, size: number, expiryMillis: number) {
    this.path = path;
    this.size = size;
    this.expiryMillis = expiryMillis;
  }
}

/** Source: `DiskStorage` plus the app's `totalSize`/`directoryURL` extension. */
export class DiskStorage {
  private readonly config: DiskConfig;
  /** Source: `path` — "directory + name". */
  readonly path: string;

  constructor(config: DiskConfig) {
    this.config = config;
    this.path = `${config.directory}/${config.name}`;
    this.createDirectory();
  }

  /** Source: `createDirectory()`. */
  private createDirectory(): void {
    if (!pathExists(this.path)) {
      fs.mkdirSync(this.path, true);
    }
  }

  /**
   * Source: `makeFileName(for:)` — MD5 there, sanitised here (see the capability-mapping note).
   * Replacing rather than stripping keeps distinct keys distinct.
   */
  makeFileName(key: string): string {
    return key.replace(/[^A-Za-z0-9._-]/g, '_');
  }

  /** Source: `makeFilePath(for:)`. */
  makeFilePath(key: string): string {
    return `${this.path}/${this.makeFileName(key)}`;
  }

  /** Source: `entry(forKey:)` — null where the source throws, expiry read off the mtime stamp. */
  entry(key: string): CacheEntry | null {
    const filePath: string = this.makeFilePath(key);
    if (!pathExists(filePath)) {
      return null;
    }
    const stat: fs.Stat = fs.statSync(filePath);
    const buffer: ArrayBuffer = new ArrayBuffer(stat.size);
    const file: fs.File = fs.openSync(filePath, fs.OpenMode.READ_ONLY);
    try {
      fs.readSync(file.fd, buffer);
    } finally {
      fs.closeSync(file);
    }
    return new CacheEntry(buffer, new Expiry(new Date(stat.mtime * 1000)), filePath);
  }

  /** Source: `setObject(_:forKey:expiry:)` — write, then stamp the expiry onto the mtime. */
  setObject(object: ArrayBuffer, key: string, expiry: Expiry | null = null): void {
    const effective: Expiry = expiry !== null ? expiry : this.config.expiry;
    const filePath: string = this.makeFilePath(key);
    const file: fs.File = fs.openSync(filePath,
      fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try {
      fs.writeSync(file.fd, object);
    } finally {
      fs.closeSync(file);
    }
    fs.utimes(filePath, effective.date.getTime());
  }

  /** Source: `removeObject(forKey:)`. */
  removeObject(key: string): void {
    const filePath: string = this.makeFilePath(key);
    if (pathExists(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /** Source: `removeAll()` — drop the directory and recreate it. */
  removeAll(): void {
    if (pathExists(this.path)) {
      fs.rmdirSync(this.path);
    }
    this.createDirectory();
  }

  private files(): DiskFile[] {
    const result: DiskFile[] = [];
    if (!pathExists(this.path)) {
      return result;
    }
    for (const name of fs.listFileSync(this.path)) {
      const filePath: string = `${this.path}/${name}`;
      const stat: fs.Stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        continue;
      }
      result.push(new DiskFile(filePath, stat.size, stat.mtime * 1000));
    }
    return result;
  }

  /**
   * Source: `removeExpiredObjects()` — delete what has expired, then, if what is left still exceeds
   * `maxSize`, delete in the source's order (newest mtime first, which is its `sortedFiles`) until
   * the total is under half of `maxSize`. That order looks backwards and is the source's.
   */
  removeExpiredObjects(): void {
    const survivors: DiskFile[] = [];
    let totalSize: number = 0;
    const now: number = Date.now();

    for (const file of this.files()) {
      if (file.expiryMillis < now) {
        fs.unlinkSync(file.path);
        continue;
      }
      totalSize += file.size;
      survivors.push(file);
    }

    if (this.config.maxSize <= 0 || totalSize <= this.config.maxSize) {
      return;
    }
    const targetSize: number = this.config.maxSize / 2;
    survivors.sort((a: DiskFile, b: DiskFile): number => b.expiryMillis - a.expiryMillis);
    for (const file of survivors) {
      fs.unlinkSync(file.path);
      totalSize -= file.size;
      if (totalSize < targetSize) {
        break;
      }
    }
  }

  /**
   * Source: the app's `DiskStorage.totalSize` extension (OutRun/Extensions/DiskStorage.swift:32-41)
   * over `FileManager.sizeOfDirectory` — null when the directory cannot be read, because the Debug
   * screen distinguishes "unknown" from 0 (it disables "Clear Cache" for both).
   */
  totalSize(): number | null {
    try {
      let size: number = 0;
      for (const file of this.files()) {
        size += file.size;
      }
      return size;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to size %{public}s: %{public}s', this.path,
        JSON.stringify(err));
      return null;
    }
  }
}

/** Source: `HybridStorage` — "Use both memory and disk storage. Try on memory first." */
export class HybridStorage {
  readonly memoryStorage: MemoryStorage;
  readonly diskStorage: DiskStorage;

  constructor(memoryStorage: MemoryStorage, diskStorage: DiskStorage) {
    this.memoryStorage = memoryStorage;
    this.diskStorage = diskStorage;
  }

  /** Source: `entry(forKey:)` — memory first; a disk hit is promoted back into memory. */
  entry(key: string): CacheEntry | null {
    const fromMemory: CacheEntry | null = this.memoryStorage.entry(key);
    if (fromMemory !== null) {
      return fromMemory;
    }
    const fromDisk: CacheEntry | null = this.diskStorage.entry(key);
    if (fromDisk === null) {
      return null;
    }
    this.memoryStorage.setObject(fromDisk.object, key, fromDisk.expiry);
    return fromDisk;
  }

  /** Source: `StorageAware.object(forKey:)` — the entry's object, null when there is no entry. */
  object(key: string): ArrayBuffer | null {
    const entry: CacheEntry | null = this.entry(key);
    return entry !== null ? entry.object : null;
  }

  /** Source: `StorageAware.existsObject(forKey:)`. */
  existsObject(key: string): boolean {
    return this.entry(key) !== null;
  }

  /** Source: `StorageAware.isExpiredObject(forKey:)`. */
  isExpiredObject(key: string): boolean {
    const entry: CacheEntry | null = this.entry(key);
    return entry === null ? true : entry.expiry.isExpired();
  }

  /** Source: `setObject(_:forKey:expiry:)` — both stores, memory first. */
  setObject(object: ArrayBuffer, key: string, expiry: Expiry | null = null): void {
    this.memoryStorage.setObject(object, key, expiry);
    this.diskStorage.setObject(object, key, expiry);
  }

  /** Source: `removeObject(forKey:)`. */
  removeObject(key: string): void {
    this.memoryStorage.removeObject(key);
    this.diskStorage.removeObject(key);
  }

  /** Source: `removeAll()` — what the Debug screen's "Clear Cache" calls. */
  removeAll(): void {
    this.memoryStorage.removeAll();
    this.diskStorage.removeAll();
  }

  /** Source: `removeExpiredObjects()`. */
  removeExpiredObjects(): void {
    this.memoryStorage.removeExpiredObjects();
    this.diskStorage.removeExpiredObjects();
  }

  /** Source: the app's `CustomImageCache.diskSize`, which reads `diskStorage.totalSize`. */
  diskSize(): number | null {
    return this.diskStorage.totalSize();
  }
}
