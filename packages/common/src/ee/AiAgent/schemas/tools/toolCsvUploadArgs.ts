import { z } from 'zod';

export const MCP_TOOL_PREPARE_CSV_UPLOAD_DESCRIPTION = `Tool: prepare_csv_upload

Purpose:
Start uploading a CSV or TSV file into the project as a new table that queries, charts and data apps can use. Use it when the user wants to work with data from a file they have.

Steps:
1. Call this tool with the file's name and its exact size in bytes.
2. Send the file's raw bytes to uploadRequest.url with an HTTP PUT and every header in uploadRequest.headers, unchanged. curlCommand does this once you put the file's path in it. Never base64-encode, retype or edit the file. The link works once and expires at expiresAt; if it expires, call this tool again.
3. Call commit_csv_upload with the uploadId and a table name.
4. Poll get_csv_upload_status until the table is ready.

Important:
- A file the user attached in claude.ai is in your code execution environment: upload it from there. If the upload fails with a network or DNS error, ask the user to add the host of uploadRequest.url under Settings → Capabilities → Code execution and file creation → Additional allowed domains, then call this tool again.
- The table becomes part of the project, visible to everyone with access to it.
`;

export const MCP_TOOL_COMMIT_CSV_UPLOAD_DESCRIPTION = `Tool: commit_csv_upload

Purpose:
Turn an uploaded file into a table, after its bytes have been sent to the URL from prepare_csv_upload.

Important:
- Returns the columns and types read from the file, and a few sample rows. Tell the user what was found.
- The table is ready to query once get_csv_upload_status reports "ready"; a large file takes longer.
- A table name that is already taken fails, and the upload stays ready to commit under another name.
`;

export const MCP_TOOL_GET_CSV_UPLOAD_STATUS_DESCRIPTION = `Tool: get_csv_upload_status

Purpose:
Check whether a committed CSV upload is ready to query.

Important:
- Poll every 5 to 10 seconds until status is "ready" or "error".
- Once ready, exploreName is the explore to query with run_metric_query or to name in a generate_data_app brief.
`;

const uploadIdInput = z
    .string()
    .uuid()
    .describe('The uploadId returned by prepare_csv_upload.');

export const mcpPrepareCsvUploadArgsSchema = z.object({
    filename: z
        .string()
        .min(1)
        .describe('File name with its .csv or .tsv extension.'),
    sizeBytes: z
        .number()
        .int()
        .positive()
        .describe(
            "The file's exact size in bytes, as the file system reports it.",
        ),
});

export const mcpPrepareCsvUploadOutputSchema = z.object({
    uploadId: z.string().describe('Pass to commit_csv_upload.'),
    uploadRequest: z.object({
        method: z.literal('PUT'),
        url: z.string(),
        headers: z
            .record(z.string(), z.string())
            .describe('Send every header exactly as given.'),
    }),
    curlCommand: z
        .string()
        .describe('The upload as a curl command; replace <path-to-file>.'),
    expiresAt: z.string().describe('When the upload link stops working.'),
});

export type McpPrepareCsvUploadOutput = z.infer<
    typeof mcpPrepareCsvUploadOutputSchema
>;

export const mcpCommitCsvUploadArgsSchema = z.object({
    uploadId: uploadIdInput,
    tableName: z
        .string()
        .describe(
            'Name for the new table: lowercase letters, numbers and underscores, starting with a letter, and not already used in the project. It becomes the explore name.',
        ),
    label: z
        .string()
        .nullish()
        .default(null)
        .describe(
            'Display name shown to users. Omit to derive it from the table name.',
        ),
});

const csvUploadColumnSchema = z.object({
    name: z.string(),
    type: z.string(),
});

export const mcpCommitCsvUploadOutputSchema = z.object({
    uploadId: z.string(),
    tableName: z.string(),
    columns: z.array(csvUploadColumnSchema),
    sampleRows: z.array(z.record(z.string(), z.unknown())),
});

export type McpCommitCsvUploadOutput = z.infer<
    typeof mcpCommitCsvUploadOutputSchema
>;

export const mcpGetCsvUploadStatusArgsSchema = z.object({
    uploadId: uploadIdInput,
});

export const MCP_CSV_UPLOAD_STATUSES = [
    'awaiting_commit',
    'processing',
    'ready',
    'error',
] as const;

export const mcpGetCsvUploadStatusOutputSchema = z.object({
    uploadId: z.string(),
    status: z.enum(MCP_CSV_UPLOAD_STATUSES),
    exploreName: z.string().nullable().describe('Set once status is "ready".'),
    rowCount: z.number().nullable(),
    columns: z.array(csvUploadColumnSchema).nullable(),
    errorMessage: z.string().nullable(),
});

export type McpGetCsvUploadStatusOutput = z.infer<
    typeof mcpGetCsvUploadStatusOutputSchema
>;
