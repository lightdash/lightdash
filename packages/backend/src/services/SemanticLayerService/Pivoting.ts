import { SemanticLayerPivot, SemanticLayerResultRow } from '@lightdash/common';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    { values, ...options }: SemanticLayerPivot,
): SemanticLayerResultRow[] {
    const df = pl.DataFrame(results, {
        columns: Object.keys(results[0]),
    });

    return df.pivot(values, options).toRecords();
}
