import { type ApiMetricsCatalog, type CatalogField } from '@lightdash/common';
import { type InfiniteData } from '@tanstack/react-query';
import { produce } from 'immer';

/**
 * Update a metrics-catalog query data
 * @param old - The old data
 * @param mutationFn - The mutation function
 * @param catalogSearchUuid - The catalog search uuid
 * @returns The updated data
 */
export const updateMetricsCatalogQuery = (
    old: InfiniteData<ApiMetricsCatalog['results']> | undefined,
    mutationFn: (item: CatalogField) => void,
    catalogSearchUuid?: string,
) => {
    if (!old?.pages) return old;

    return produce(old, (draft) => {
        draft.pages.forEach((page) => {
            page.data.forEach((item) => {
                if (
                    !catalogSearchUuid ||
                    item.catalogSearchUuid === catalogSearchUuid
                ) {
                    mutationFn(item);
                }
            });
        });
    });
};
