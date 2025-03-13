import type { ResultsPaginationArgs } from '@lightdash/common';

import { PaginationError } from '@lightdash/common';

export function getNextAndPreviousPage(page: number, totalPageCount: number) {
    const nextPage =
        page >= totalPageCount || totalPageCount === 0 ? undefined : page + 1;

    const previousPage = page > 1 ? page - 1 : undefined;

    return {
        nextPage,
        previousPage,
    };
}

export function validatePagination({
    pageSize,
    page,
    queryMaxLimit,
}: Required<ResultsPaginationArgs> & {
    queryMaxLimit: number;
}) {
    if (page < 1) {
        throw new PaginationError('page should be greater than 0');
    }

    if (pageSize < 1) {
        throw new PaginationError(`page size should be greater than 0`);
    }

    if (pageSize > queryMaxLimit) {
        throw new PaginationError(
            `page size is too large, max is ${queryMaxLimit}`,
        );
    }
}
