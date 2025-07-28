<summary>
External service integration clients providing connectivity to AWS services, communication platforms (Slack, Teams, Email), Google Drive, GitHub, and Docker Hub. Centrally managed through ClientRepository with dependency injection pattern.
</summary>

<howToUse>
All clients are managed through the ClientRepository which provides memoized instances and dependency injection. Import the repository and access clients via getter methods.

```typescript
import { ClientRepository } from './ClientRepository';

// Get repository instance
const clientRepository = new ClientRepository({
    lightdashConfig,
    s3Client: mockS3Client, // optional override for testing
});

// Access clients via getters
const emailClient = clientRepository.getEmailClient();
const slackClient = clientRepository.getSlackClient();
const s3Client = clientRepository.getS3Client();

// Use clients for operations
await emailClient.sendInviteEmail({
    recipientEmail: 'user@example.com',
    inviteUrl: 'https://app.lightdash.com/invite/...',
    organizationName: 'My Org',
});

await slackClient.postMessage(channel, 'Hello from Lightdash!');
```

</howToUse>

<codeExample>

```typescript
// Example: Send scheduled delivery email with attachments
const emailClient = clientRepository.getEmailClient();
await emailClient.sendScheduledDeliveryEmail({
    recipientEmail: 'manager@company.com',
    scheduledDeliveryUuid: 'delivery-123',
    resourceTitle: 'Weekly Sales Dashboard',
    getResourceUrl: () => 'https://app.lightdash.com/projects/...',
    csvUrls: ['https://s3.bucket.com/report.csv'],
    pdfFile: pdfBuffer,
    schedulerUuid: 'scheduler-456',
});

// Example: Upload results to S3 and get pre-signed URL
const s3Client = clientRepository.getS3Client();
const uploadResult = await s3Client.uploadFile({
    body: csvContent,
    filename: 'results.csv',
    encoding: 'utf-8',
});
const downloadUrl = await s3Client.getDownloadUrl(uploadResult.path);

// Example: Create GitHub repository file
const gitClient = clientRepository.getGithubClient();
await gitClient.createFile({
    owner: 'myorg',
    repo: 'analytics',
    path: 'dashboards/sales.yml',
    content: yamlContent,
    message: 'Add sales dashboard config',
});
```

</codeExample>

<importantToKnow>
- ClientRepository uses memoization - clients are instantiated once and reused
- All clients check lightdashConfig for feature flags and credentials before operating
- Client overrides in constructor are useful for testing and dependency injection
- Email templates are located in `/EmailClient/templates/` with Handlebars support
- S3 clients handle both caching and file storage with different specialized interfaces
- Slack client requires OAuth setup and handles webhook URL verification
- GitHub client manages OAuth token refresh automatically
- All clients include comprehensive error handling and Sentry integration
- Docker Hub client checks for Lightdash version updates
</importantToKnow>

<links>
@/packages/backend/src/config/lightdashConfig.ts - Client configuration settings
@/packages/backend/src/clients/EmailClient/templates/ - Email template directory
@/packages/backend/src/clients/Slack/SlackMessageBlocks.ts - Slack message formatting
@/packages/backend/src/clients/EmailClient/EmailClient.ts - Email client
</links>
