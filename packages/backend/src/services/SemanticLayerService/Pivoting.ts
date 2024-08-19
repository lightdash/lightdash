import {
    SemanticLayerPivotConfig,
    SemanticLayerResultRow,
} from '@lightdash/common';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    pivotConfig: SemanticLayerPivotConfig,
): SemanticLayerResultRow[] {
    const df = pl.DataFrame(results, {
        columns: Object.keys(results[0]),
    });

    const { values, ...options } = pivotConfig;
    return df.pivot(values, options).toRecords();
}
