import { ParameterError } from '@lightdash/common';

type PaginateAsCodeArgs<T> = {
    items: T[];
    offset: number | undefined;
    pageSize: number;
};

type PaginateAsCodeResult<T> = {
    page: T[];
    total: number;
    offset: number;
};

/**
 * Paginates an in-memory array using the offset/maxDownloads convention shared
 * by all as-code download endpoints. The returned `offset` is the next position
 * to resume from; callers stop when `offset >= total`.
 */
export const paginateAsCode = <T>({
    items,
    offset,
    pageSize,
}: PaginateAsCodeArgs<T>): PaginateAsCodeResult<T> => {
    const offsetIndex = offset ?? 0;
    if (offsetIndex < 0) {
        throw new ParameterError(
            `offset must be >= 0, received ${offsetIndex}`,
        );
    }

    const newOffset = Math.min(offsetIndex + pageSize, items.length);
    return {
        page: items.slice(offsetIndex, newOffset),
        total: items.length,
        offset: newOffset,
    };
};
