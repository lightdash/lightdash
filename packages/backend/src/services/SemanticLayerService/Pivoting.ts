import { SemanticLayerPivot, SemanticLayerResultRow } from '@lightdash/common';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    { values, ...options }: SemanticLayerPivot,
): SemanticLayerResultRow[] {
    const df = pl.DataFrame(results);
    const aggs: Record<string, keyof pl.Expr> = values.reduce(
        (acc, value) => ({
            ...acc,
            [value.name]: value.aggFunction,
        }),
        {},
    );

    return df
        .groupBy(options.on)
        .agg(aggs)
        .pivot(
            values.map((v) => v.name),
            options,
        )
        .toRecords();
}
