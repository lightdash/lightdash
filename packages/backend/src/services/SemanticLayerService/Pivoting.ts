import {
    convertToResultsColumns,
    mapFieldNameToResultsColumns,
    SemanticLayerPivot,
    SemanticLayerResultRow,
    type SemanticLayerColumnMapping,
} from '@lightdash/common';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    { values, ...options }: SemanticLayerPivot,
    columnMappings: SemanticLayerColumnMapping[],
): SemanticLayerResultRow[] {
    // Find the column name, this might still have different casing from the results
    const valuesMappedColumns = mapFieldNameToResultsColumns(
        values,
        columnMappings,
    );
    const onMappedColumns = mapFieldNameToResultsColumns(
        options.on,
        columnMappings,
    );
    const indexMappedColumns = mapFieldNameToResultsColumns(
        options.index,
        columnMappings,
    );

    const resultsColumns = Object.keys(results[0] ?? {});

    // Convert the column names to the correct casing
    const valuesColumns = convertToResultsColumns(
        valuesMappedColumns,
        resultsColumns,
    );
    const resultsColOptions = {
        on: convertToResultsColumns(onMappedColumns, resultsColumns),
        index: convertToResultsColumns(indexMappedColumns, resultsColumns),
    };

    return pl
        .DataFrame(results)
        .pivot(valuesColumns, resultsColOptions)
        .toRecords();
}
