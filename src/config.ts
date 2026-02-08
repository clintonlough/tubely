import { newDatabase } from "./db/db";
import type { Database } from "bun:sqlite";
import { s3, S3Client } from "bun";

export type ApiConfig = {
  db: Database;
  jwtSecret: string;
  platform: string;
  filepathRoot: string;
  assetsRoot: string;
  s3Client: S3Client;
  s3Bucket: string;
  s3Region: string;
  s3CfDistribution: string;
  port: string;
};

const pathToDB = envOrThrow("DB_PATH");
const jwtSecret = envOrThrow("JWT_SECRET");
const platform = envOrThrow("PLATFORM");
const filepathRoot = envOrThrow("FILEPATH_ROOT");
const assetsRoot = envOrThrow("ASSETS_ROOT");
const s3Client = createS3Client();
const s3Bucket = envOrThrow("S3_BUCKET");
const s3Region = envOrThrow("S3_REGION");
const s3CfDistribution = envOrThrow("CDN_DISTRIBUTION_URL");
const port = envOrThrow("PORT");

const db = newDatabase(pathToDB);

export const cfg: ApiConfig = {
  db: db,
  jwtSecret: jwtSecret,
  platform: platform,
  filepathRoot: filepathRoot,
  assetsRoot: assetsRoot,
  s3Client: s3Client,
  s3Bucket: s3Bucket,
  s3Region: s3Region,
  s3CfDistribution: s3CfDistribution,
  port: port,
};

function envOrThrow(key: string) {
  const envVar = process.env[key];
  if (!envVar) {
    throw new Error(`${key} must be set`);
  }
  return envVar;
}

function createS3Client() {
  const client = new S3Client({
  accessKeyId: envOrThrow("AWS_ACCESS_KEY_ID"),
  secretAccessKey: envOrThrow("AWS_SECRET_ACCESS_KEY"),
  bucket: envOrThrow("S3_BUCKET"),
  // sessionToken: "..."
  // acl: "public-read",
  // endpoint: "https://s3.us-east-1.amazonaws.com",
  // endpoint: "https://<account-id>.r2.cloudflarestorage.com", // Cloudflare R2
  // endpoint: "https://<region>.digitaloceanspaces.com", // DigitalOcean Spaces
  // endpoint: "http://localhost:9000", // MinIO
});

  return client;
}