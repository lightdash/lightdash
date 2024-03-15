import { SchedulerClient } from '../scheduler/SchedulerClient';
import { S3Client } from './Aws/s3';
import { S3CacheClient } from './Aws/S3CacheClient';
import DbtCloudGraphqlClient from './dbtCloud/DbtCloudGraphqlClient';
import EmailClient from './EmailClient/EmailClient';
import { GoogleDriveClient } from './Google/GoogleDriveClient';
import { SlackClient } from './Slack/SlackClient';

/**
 * Interface outlining all clients. Add new client to
 * this list (in alphabetical order, please!).
 */
export interface ClientManifest {
    dbtCloudGraphqlClient: DbtCloudGraphqlClient;
    emailClient: EmailClient;
    googleDriveClient: GoogleDriveClient;
    s3CacheClient: S3CacheClient;
    s3Client: S3Client;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
}
