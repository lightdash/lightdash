export enum DownloadFileType {
    CSV = 'csv',
    IMAGE = 'image',
}

export type DownloadFile = {
    nanoid: string;
    path: string;
    createdAt: Date;
    type: DownloadFileType;
};
