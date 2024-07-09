export enum DownloadFileType {
    CSV = 'csv',
    IMAGE = 'image',
    JSONL = 'jsonl',
    S3_JSONL = 's3_jsonl',
}

export type DownloadFile = {
    nanoid: string;
    path: string;
    createdAt: Date;
    type: DownloadFileType;
};
