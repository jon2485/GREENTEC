// Digital files live in a Railway Storage Bucket (S3-compatible). Downloads go directly from the
// bucket to the customer through short-lived signed links – never through the web server.
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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
