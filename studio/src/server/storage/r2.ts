import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, PutObjectInput, StoredObject, SignedUpload } from './provider';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Override endpoint (defaults to the R2 S3 API for the account). */
  endpoint?: string;
  /** Public CDN base (e.g. https://cdn.poddarcreation.studio) for openly-served objects. */
  publicBase?: string;
}

/**
 * Cloudflare R2 driver over the S3-compatible API. The same class serves AWS S3 / any
 * S3-compatible store by supplying a different `endpoint`. Enabled with STORAGE_DRIVER=r2.
 */
export class R2StorageProvider implements StorageProvider {
  readonly name = 'r2';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase?: string;

  constructor(cfg: R2Config) {
    this.bucket = cfg.bucket;
    this.publicBase = cfg.publicBase;
    this.client = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint ?? `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const res = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl ?? 'public, max-age=31536000, immutable',
        Metadata: input.metadata,
      })
    );
    return { key: input.key, size: input.body.byteLength, etag: res.ETag?.replace(/"/g, ''), contentType: input.contentType };
  }

  async get(key: string): Promise<{ body: Buffer; contentType?: string } | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) return null;
      return { body: Buffer.from(bytes), contentType: res.ContentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<void> {
    const objects = await this.list(prefix);
    if (objects.length === 0) return;
    // DeleteObjects handles up to 1000 keys per call.
    for (let i = 0; i < objects.length; i += 1000) {
      const chunk = objects.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: chunk.map((o) => ({ Key: o.key })) } })
      );
    }
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const out: StoredObject[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token })
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) out.push({ key: obj.Key, size: obj.Size ?? 0, etag: obj.ETag?.replace(/"/g, '') });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  publicUrl(key: string): string | null {
    return this.publicBase ? `${this.publicBase}/${key}` : null;
  }

  getSignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async getSignedUploadUrl(key: string, contentType: string, expiresInSeconds = 900): Promise<SignedUpload> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds }
    );
    return { url, method: 'PUT', headers: { 'Content-Type': contentType } };
  }
}
