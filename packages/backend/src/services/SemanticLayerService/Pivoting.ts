import { SemanticLayerPivot, SemanticLayerResultRow } from '@lightdash/common';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    { values, ...options }: SemanticLayerPivot,
): SemanticLayerResultRow[] {
    return pl
        .DataFrame(results)
        .pivot(values, {
            on: options.on?.reference ?? [],
            index: options.index,
        })
        .toRecords();
}
