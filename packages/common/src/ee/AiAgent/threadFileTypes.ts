/** Per-file cap for documents attached to an agent conversation. */
export const AI_THREAD_FILE_MAX_BYTES = 1024 * 1024;
export const AI_THREAD_FILE_MAX_NAME_LENGTH = 255;
/** Total attached-file bytes a single prompt inlines into the model context. */
export const AI_THREAD_FILE_INLINE_BUDGET_BYTES = 32 * 1024;
/** Unclaimed uploads expire after this and are swept. */
export const AI_THREAD_FILE_UNCLAIMED_TTL_HOURS = 24;
/** Unclaimed uploads one user may hold at a time. */
export const AI_THREAD_FILE_MAX_UNCLAIMED_PER_USER = 50;
/** Uploads one user may start per minute. */
export const AI_THREAD_FILE_MAX_UPLOADS_PER_MINUTE = 30;
/** Virtual directory the agent reads attached files from. */
export const AI_THREAD_FILE_MOUNT_PATH = '/attachments';

/** Extensions offered by the file picker; the server accepts any UTF-8 text. */
export const AI_THREAD_FILE_PICKER_EXTENSIONS = [
    '.md',
    '.markdown',
    '.txt',
    '.json',
    '.yml',
    '.yaml',
    '.sql',
    '.log',
    '.xml',
    '.html',
    '.toml',
    '.csv',
    '.tsv',
] as const;

/** A text document uploaded by a user for an agent conversation. */
export type AiThreadFile = {
    uuid: string;
    fileName: string;
    sizeBytes: number;
    /** Null until the file is sent with a prompt. */
    threadUuid: string | null;
    promptUuid: string | null;
    createdAt: Date;
};

export type ApiAiThreadFileResponse = {
    status: 'ok';
    results: AiThreadFile;
};

export const formatAiThreadFileSize = (sizeBytes: number): string => {
    if (sizeBytes < 1024) return `${sizeBytes}B`;
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)}KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
};
