import { type ResultRow, type SqlColumn } from '@lightdash/common';

export type ResultsAndColumns = {
    results: ResultRow[];
    columns: SqlColumn[];
};
