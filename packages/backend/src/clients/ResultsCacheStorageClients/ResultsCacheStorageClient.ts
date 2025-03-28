import type { WarehouseResults } from '@lightdash/common';

export interface IResultsCacheStorageClient {
    createUploadStream(
        cacheKey: string,
        pageSize: number,
    ): {
        write: (rows: WarehouseResults['rows']) => Promise<void>;
        close: () => Promise<void>;
    };
    download(
        cacheKey: string,
        page: number,
        pageSize: number,
    ): Promise<ReadableStream>;
}
