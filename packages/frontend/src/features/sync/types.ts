import { type SavedChart } from '@lightdash/common';

// Discriminates which resource a Google Sheets sync belongs to, so the
// create/edit form knows which scheduler endpoint to call without relying on
// which optional fields happen to be set.
export type SyncResource =
    | {
          type: 'chart';
          chart: Pick<
              SavedChart,
              | 'uuid'
              | 'organizationUuid'
              | 'projectUuid'
              | 'tableName'
              | 'metricQuery'
          >;
      }
    | { type: 'sqlChart'; projectUuid: string; savedSqlUuid: string }
    | { type: 'app'; projectUuid: string; appUuid: string };
