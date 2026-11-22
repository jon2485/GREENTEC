// Digital files live in a Railway Storage Bucket (S3-compatible). Downloads go directly from the
// bucket to the customer through short-lived signed links – never through the web server.
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const env = (...k: string[]) => k.map((x) => process.env[x]).find(Boolean) || '';
export const BUCKET = env('S3_BUCKET', 'BUCKET');
let client: S3Client | null = null;
export function s3() {
  if (!client) client = new S3Client({
    region: env('S3_REGION', 'REGION') || 'auto', endpoint: env('S3_ENDPOINT', 'ENDPOINT') || undefined, forcePathStyle: false,
    credentials: { accessKeyId: env('S3_ACCESS_KEY_ID', 'ACCESS_KEY_ID'), secretAccessKey: env('S3_SECRET_ACCESS_KEY', 'SECRET_ACCESS_KEY') },
  });
  return client;
}
export const storageReady = () => Boolean(BUCKET && env('S3_ACCESS_KEY_ID', 'ACCESS_KEY_ID'));
export async function signedDownload(key: string, filename: string, seconds = 3600) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` }), { expiresIn: seconds });
}
export async function signedUpload(key: string, contentType = 'application/octet-stream', seconds = 3600) {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn: seconds });
}
export async function exists(key: string) { try { await s3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; } catch { return false; } }

// ---- admin uploads: browser → bucket directly (presigned PUT; multipart for big files) ----
export async function signedGet(key: string, seconds = 3600) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: seconds });
}
export async function removeObject(key: string) { await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); }
export async function multipartStart(key: string, contentType = 'application/octet-stream') {
  const r = await s3().send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }));
  return r.UploadId!;
}
export async function multipartPartUrls(key: string, uploadId: string, from: number, count: number, seconds = 6 * 3600) {
  const urls: string[] = [];
  for (let n = from; n < from + count; n++) urls.push(await getSignedUrl(s3(), new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: n }), { expiresIn: seconds }));
  return urls;
}
export async function multipartComplete(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
  await s3().send(new CompleteMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) } }));
}
export async function multipartAbort(key: string, uploadId: string) { await s3().send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId })); }
// Browser uploads need CORS on the bucket (PUT from the site origin, ETag exposed for multipart).
export async function setBucketCors(origins: string[]) {
  await s3().send(new PutBucketCorsCommand({ Bucket: BUCKET, CORSConfiguration: { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 }] } }));
}
export const safeKeyPart = (name: string) => name.normalize('NFC').replace(/[\\/:*?"<>|#%]+/g, '_').replace(/\s+/g, '_').slice(-120);
