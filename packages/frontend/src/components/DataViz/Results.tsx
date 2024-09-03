import { type ResultRow, type VizSqlColumn } from '@lightdash/common';

export type ResultsAndColumns = {
    results: ResultRow[];
    columns: VizSqlColumn[];
};
