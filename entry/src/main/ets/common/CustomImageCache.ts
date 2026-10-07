/*
 * Port of `CustomImageCache` (OutRun/Models/Data/CustomImageCache.swift:24-142) — the cache the
 * rendered workout-route map images live in, and the only consumer of common/HybridStorage.ts
 * (the Cache pod's memory+disk storage, ported as a Rule-11 port task).
 *
 * The source's storage was typed <String, UIImage> and the pod's TransformerFactory.forImage() did
 * the image <-> bytes step inside it. HybridStorage here stores ArrayBuffer, so that step is this
 * module's: PNG via @ohos.multimedia.image (packToData out, createImageSource/createPixelMap back),
 * lossless like the pod's PNG transformer. Both directions are async where the source was
 * synchronous, which is why `set` and `getMapImage` return Promises.
 *
 * The configuration is the source's: disk "MapImageCache", never expiring, 5 MB cap; memory 50
 * entries expiring 15 minutes after the cache was created.
 */
import { image } from '@kit.ImageKit';
import { application, common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DiskConfig, DiskStorage, Expiry, HybridStorage, MemoryConfig, MemoryStorage } from './HybridStorage';

const DOMAIN: number = 0x0000;
const TAG: string = 'CustomImageCache';

const DISK_NAME: string = 'MapImageCache';
const DISK_MAX_SIZE: number = 5000000;
const MEMORY_COUNT_LIMIT: number = 50;
const MEMORY_EXPIRY_SECONDS: number = 15 * 60;
const PNG_FORMAT: string = 'image/png';

export class CustomImageCache {
  private static instance: CustomImageCache | null = null;

  /** Source: `static let mapImageCache` — built on first use, since it needs the app context. */
  static get mapImageCache(): CustomImageCache {
    if (CustomImageCache.instance === null) {
      CustomImageCache.instance = new CustomImageCache();
    }
    return CustomImageCache.instance;
  }

  /** Source: the three private storages; null when the storage could not be created. */
  private readonly hybridStorage: HybridStorage | null;

  /** Source: `init()`. */
  constructor() {
    let storage: HybridStorage | null = null;
    try {
      const context: common.Context = application.getApplicationContext();
      const diskConfig: DiskConfig =
        new DiskConfig(DISK_NAME, Expiry.never(), DISK_MAX_SIZE, context.cacheDir);
      const memoryConfig: MemoryConfig =
        new MemoryConfig(Expiry.seconds(MEMORY_EXPIRY_SECONDS), MEMORY_COUNT_LIMIT);
      const disk: DiskStorage = new DiskStorage(diskConfig);
      const memory: MemoryStorage = new MemoryStorage(memoryConfig);
      storage = new HybridStorage(memory, disk);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to initiate map image cache: %{public}s', JSON.stringify(err));
    }
    this.hybridStorage = storage;
  }

  /** Source: `diskSize` — null when unknown, which the Debug screen shows differently from 0. */
  get diskSize(): number | null {
    return this.hybridStorage !== null ? this.hybridStorage.diskSize() : null;
  }

  /** Source: `set(mapImage:for:)`. */
  async set(mapImage: image.PixelMap, key: string): Promise<void> {
    const storage: HybridStorage | null = this.hybridStorage;
    if (storage === null) {
      return;
    }
    const packer: image.ImagePacker = image.createImagePacker();
    try {
      const option: image.PackingOption = { format: PNG_FORMAT, quality: 100 };
      storage.setObject(await packer.packToData(mapImage, option), key);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to set image: %{public}s', JSON.stringify(err));
    } finally {
      await packer.release();
    }
  }

  /** Source: `getMapImage(for:)` — null when nothing is cached under the key. */
  async getMapImage(key: string): Promise<image.PixelMap | null> {
    const storage: HybridStorage | null = this.hybridStorage;
    if (storage === null) {
      return null;
    }
    let source: image.ImageSource | null = null;
    try {
      const bytes: ArrayBuffer | null = storage.existsObject(key) ? storage.object(key) : null;
      if (bytes === null) {
        return null;
      }
      source = image.createImageSource(bytes);
      return await source.createPixelMap();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to get image: %{public}s', JSON.stringify(err));
      return null;
    } finally {
      if (source !== null) {
        await source.release();
      }
    }
  }

  /** Source: `clear(completion:)` — the Debug screen's "Clear Cache". */
  clear(): boolean {
    const storage: HybridStorage | null = this.hybridStorage;
    if (storage === null) {
      return false;
    }
    try {
      storage.removeAll();
      return true;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to clear cache: %{public}s', JSON.stringify(err));
      return false;
    }
  }
}
