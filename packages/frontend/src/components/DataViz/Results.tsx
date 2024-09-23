import { type RawResultRow, type VizColumn } from '@lightdash/common';

export type ResultsAndColumns = {
    results: RawResultRow[];
    columns: VizColumn[];
};
