import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2(fileBuffer, mimeType, folder = 'photos') {
  const fileExtension = mimeType.split('/')[1] || 'jpg';
  const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    })
  );

  const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
  return { fileName, publicUrl };
}

export async function deleteFromR2(fileName) {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
    })
  );
}

export default r2Client;
