import {
    convertToResultsColumns,
    SemanticLayerPivot,
    SemanticLayerResultRow,
} from '@lightdash/common';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    { values, ...options }: SemanticLayerPivot,
): SemanticLayerResultRow[] {
    // These might have different casing from the config, so we need to find the correct column name
    const resultsColumns = Object.keys(results[0] ?? {});
    const valuesColumns = convertToResultsColumns(values, resultsColumns);
    const resultsColOptions = {
        on: convertToResultsColumns(options.on, resultsColumns),
        index: convertToResultsColumns(options.index, resultsColumns),
    };

    return pl
        .DataFrame(results)
        .pivot(valuesColumns, resultsColOptions)
        .toRecords();
}
