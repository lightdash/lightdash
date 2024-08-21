import { SemanticLayerPivot, SemanticLayerResultRow } from '@lightdash/common';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    { values, ...options }: SemanticLayerPivot,
): SemanticLayerResultRow[] {
    const df = pl.DataFrame(results);
    const aggExp = values.reduce<undefined | pl.Expr>((acc, val) => {
        if (acc === undefined) {
            return pl.col(val.name)[val.aggFunction]();
        }

        return acc.and(pl.col(val.name)[val.aggFunction]());
    }, undefined);

    return df
        .pivot(
            values.map((v) => v.name),
            {
                ...options,
                aggregateFunc: aggExp,
            },
        )
        .toRecords();
}
