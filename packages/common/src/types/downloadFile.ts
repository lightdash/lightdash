export enum DownloadFileType {
    CSV = 'csv',
    IMAGE = 'image',
    JSONL = 'jsonl',
}

export type DownloadFile = {
    nanoid: string;
    path: string;
    createdAt: Date;
    type: DownloadFileType;
};
