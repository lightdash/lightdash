import { SemanticLayerPivot, SemanticLayerResultRow } from '@lightdash/common';
import uniq from 'lodash/uniq';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    allDimensions: string[],
    { values, ...options }: SemanticLayerPivot,
): SemanticLayerResultRow[] {
    const df = pl.DataFrame(results);

    console.info('og pivot config ----------------------');
    console.info({ values, ...options });

    console.info('OG data frame ----------------------');
    console.info(df);

    const aggs: Record<string, keyof pl.Expr> = values.reduce(
        (acc, value) => ({
            ...acc,
            [value.name]: value.aggFunction,
        }),
        {},
    );

    const dimensionsToGroupBy = uniq([
        ...options.on,
        ...options.index,
        ...allDimensions,
    ]).filter((dim) => !values.map((v) => v.name).includes(dim));

    console.info({ on: options.on, index: options.index, allDimensions });
    console.info({ dimensionsToGroupBy });

    const groupedByDf = df.groupBy(dimensionsToGroupBy).agg(aggs);

    console.info('Grouped by data frame ----------------------');
    console.info(groupedByDf);

    const pivotedDf = groupedByDf.pivot(
        values.map((v) => v.name),
        options,
    );

    console.info('Pivoted data frame ----------------------');
    console.info(pivotedDf);

    return pivotedDf.toRecords();
}
