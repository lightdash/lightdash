import { WarehouseResults } from '@lightdash/common';
import { Readable } from 'stream';

export interface IResultsCacheStorageClient {
    createUploadStream(
        cacheKey: string,
        pageSize: number,
    ): {
        write: (rows: WarehouseResults['rows']) => Promise<void>;
        close: () => Promise<void>;
    };
    getDowloadStream(cacheKey: string): Promise<Readable>;
}
