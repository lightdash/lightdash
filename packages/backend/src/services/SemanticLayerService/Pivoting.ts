import { SemanticLayerPivot, SemanticLayerResultRow } from '@lightdash/common';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    { values, on, index }: SemanticLayerPivot,
): SemanticLayerResultRow[] {
    if (values.length === 0) return results;
    if (on.length === 0) return results;

    console.log({ values, on, index });

    return pl
        .DataFrame(results)
        .pivot(values, {
            // POLARS IMPLEMENTATION IS BACKWARDS! (this is the opposite of their docs)
            on,
            index,
        })
        .toRecords();
}
