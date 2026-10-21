import {S3Client,CreateBucketCommand} from '@aws-sdk/client-s3';
const client=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY!,secretAccessKey:process.env.S3_SECRET_KEY!}});
client.send(new CreateBucketCommand({Bucket:process.env.S3_BUCKET})).then(()=>{console.log('Own storage bucket ready');client.destroy()}).catch(e=>{console.error(e.name);process.exit(1)});
