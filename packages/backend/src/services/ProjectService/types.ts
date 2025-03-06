import {
    MetricQuery,
    type ItemsMap,
    type ResultsPaginationArgs,
} from '@lightdash/common';

export type PaginateQueryArgs = ResultsPaginationArgs &
    (
        | {
              metricQuery: MetricQuery;
              csvLimit: number | null | undefined;
          }
        | {
              queryId: string;
              fields: ItemsMap;
              exploreName: string;
          }
    );
