export interface ResultsCacheStorageClient {
    upload(
        cacheKey: string,
        data: ReadableStream,
        pageSize: number,
    ): Promise<void>;
    download(
        cacheKey: string,
        page: number,
        pageSize: number,
    ): Promise<ReadableStream>;
}
