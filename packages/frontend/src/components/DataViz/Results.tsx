import { type RawResultRow, type VizSqlColumn } from '@lightdash/common';

export type ResultsAndColumns = {
    results: RawResultRow[];
    columns: VizSqlColumn[];
};
