import { SemanticLayerPivot, SemanticLayerResultRow } from '@lightdash/common';
import uniq from 'lodash/uniq';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    allDimensions: string[],
    pivot: SemanticLayerPivot,
): SemanticLayerResultRow[] {
    const { values, ...options } = pivot;
    const df = pl.DataFrame(results);

    if (!options.index.length) {
        const aliasedAggs: pl.Expr[] = values.map((v) =>
            pl
                .col(v.name)
                [v.aggFunction]()
                .alias(`${v.aggFunction}(${v.name})`),
        );

        return df
            .groupBy(options.on)
            .agg(...aliasedAggs)
            .toRecords();
    }

    // Group by all dimensions that are not in the values
    const dimensionsToGroupBy = uniq([
        ...options.on,
        ...options.index,
        ...allDimensions,
    ]).filter((dim) => !values.map((v) => v.name).includes(dim));

    // This can happen when we group by and aggregate on the same dimension
    if (dimensionsToGroupBy.length === 0) {
        return results;
    }

    const aggs: pl.Expr[] = values.map((v) => pl.col(v.name)[v.aggFunction]());

    return df
        .groupBy(dimensionsToGroupBy)
        .agg(...aggs)
        .withColumns(pl.col(dimensionsToGroupBy).fillNull('zero'))
        .pivot(
            values.map((v) => v.name),
            options,
        )
        .toRecords();
}
