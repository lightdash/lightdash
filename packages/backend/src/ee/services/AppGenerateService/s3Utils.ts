import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const readS3ObjectAsBuffer = async (
    s3Client: S3Client,
    bucket: string,
    key: string,
): Promise<Buffer> => {
    const response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const body = response.Body;
    if (!body || typeof (body as NodeJS.ReadableStream).on !== 'function') {
        throw new Error(`Unexpected S3 response body type for key=${key}`);
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};
