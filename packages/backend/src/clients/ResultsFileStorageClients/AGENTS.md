<summary>
S3-based file storage for query results, enabling streaming uploads and pre-signed download URLs. Used by AsyncQueryService to store large result sets (JSONL) and by export features for Excel/CSV files.
</summary>

<howToUse>
Access via `ClientRepository.getResultsFileStorageClient()`. The client extends `S3CacheClient` and provides streaming upload capabilities for warehouse query results plus direct file uploads.

```typescript
const resultsClient = clientRepository.getResultsFileStorageClient();

// Always check if S3 storage is configured before use
if (resultsClient.isEnabled) {
    // Upload query results as stream or upload files directly
}
```

</howToUse>

<codeExample>

```typescript
// Primary use case: Stream warehouse query results to S3
// (see AsyncQueryService.runAsyncWarehouseQuery for real usage)
const fileName = S3ResultsFileStorageClient.sanitizeFileExtension(cacheKey);
const stream = resultsClient.createUploadStream(fileName, {
    contentType: 'application/jsonl',
});

// Pass write callback to warehouse client for streaming rows
await warehouseClient.executeAsyncQuery(query, {
    write: stream.write, // Streams rows as JSONL to S3
});
await stream.close(); // Finalize upload when query completes

// Read results back for pagination
const downloadStream = await resultsClient.getDownloadStream(cacheKey, 'jsonl');

// Get pre-signed URL for direct client download
const url = await resultsClient.getFileUrl(cacheKey, 'jsonl');

// Upload pre-generated files (Excel exports)
const downloadUrl = await resultsClient.uploadFile(
    'exports/report.xlsx',
    '/tmp/report.xlsx',
    {
        contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
);
```

</codeExample>

<importantToKnow>
- `isEnabled` returns false if S3 is not configured - always check before using
- `createUploadStream` returns `{ write, close, writeStream }` - call `close()` to finalize upload
- `write(rows)` serializes each row as JSONL (`JSON.stringify(row) + '\n'`) synchronously
- File extension auto-appended via `sanitizeFileExtension` if missing
- Pre-signed URLs expire based on `lightdashConfig.s3.expirationTime`
- Throws `MissingConfigError` if methods called when S3 not configured
- Without S3 configured, async queries fall back to re-querying warehouse (Snowflake only)
</importantToKnow>

<links>
@packages/backend/src/clients/Aws/S3CacheClient.ts - Base S3 client with credentials and bucket config
@packages/backend/src/clients/ClientRepository.ts - Access point for all clients
@packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts - Primary consumer of this client
@packages/backend/src/config/lightdashConfig.ts - S3 configuration settings
</links>
