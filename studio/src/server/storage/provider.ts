/**
 * Provider-agnostic object storage (Priority 1). App code depends only on this interface;
 * the composition root selects a driver from `STORAGE_DRIVER`. Adding AWS S3 / GCS / Azure
 * later is a new driver implementing this contract — no call-site changes. R2 is
 * S3-compatible, so the `@aws-sdk/client-s3` driver already covers S3 by endpoint config.
 */

export interface PutObjectInput {
  /** Folder-organized logical key, e.g. "fabrics/rayon14/<colour>/<v>/<id>.webp". */
  key: string;
  body: Buffer;
  contentType: string;
  /** Provider object metadata (e.g. checksum, uploader). */
  metadata?: Record<string, string>;
  /** Cache-Control for the stored object; defaults to long-lived immutable for hashed keys. */
  cacheControl?: string;
}

export interface StoredObject {
  key: string;
  size: number;
  etag?: string;
  contentType?: string;
}

export interface SignedUpload {
  url: string;
  method: 'PUT' | 'POST';
  /** Headers the client must send with the signed request (e.g. Content-Type). */
  headers?: Record<string, string>;
  /** For local dev the direct multipart endpoint is used instead of a presigned PUT. */
  direct?: boolean;
}

export interface StorageProvider {
  readonly name: string;

  put(input: PutObjectInput): Promise<StoredObject>;
  /** Read object bytes (used by the local media route; R2 serves via URLs instead). */
  get(key: string): Promise<{ body: Buffer; contentType?: string } | null>;
  delete(key: string): Promise<void>;
  /** Cleanup: delete every object under a prefix (e.g. all versions of a media asset). */
  deletePrefix(prefix: string): Promise<void>;
  list(prefix: string): Promise<StoredObject[]>;

  /** A short-lived signed URL to GET a private object. */
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /** A signed target the browser can upload directly to (bypassing the app server). */
  getSignedUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<SignedUpload>;

  /** Public, cacheable URL when the object is served openly (public bucket / CDN). Null if private-only. */
  publicUrl(key: string): string | null;
}
