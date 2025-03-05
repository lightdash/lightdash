import {
    MetricQuery,
    type ItemsMap,
    type WarehousePaginationArgs,
} from '@lightdash/common';

export type PaginateQueryArgs = WarehousePaginationArgs &
    (
        | {
              metricQuery: MetricQuery;
              csvLimit: number | null | undefined;
          }
        | {
              queryId: string;
              fields: ItemsMap;
          }
    );
