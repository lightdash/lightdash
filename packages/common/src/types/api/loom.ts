export type LoomThumbnailResult = {
    thumbnailUrl: string;
    title?: string;
};

export type ApiLoomThumbnailResponse = {
    status: 'ok';
    results: LoomThumbnailResult;
};
