import {
    SupportedDbtAdapter,
    type MergeFieldTypes,
    type MergeQuery,
    type MergeTerminalWrapper,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import {
    getMergeJoinKeySqlOptions,
    MergeQueryBuilder,
} from './MergeQueryBuilder';

export type ComposeMergeSql = {
    /** The composable DuckDB join core — no ORDER BY, LIMIT or guard column. */
    coreSql: string;
    /** Terminal stage (sort, limit, truncation guard) for the run path to attach. */
    terminalWrapper: MergeTerminalWrapper;
    /** Reference table name per source id, for binding to leg queryUuids. */
    referenceTableBySourceId: Record<string, string>;
};

/** Table name a merge source's results are exposed under in the compose SQL. */
export const composeMergeReferenceTable = (sourceIndex: number): string =>
    `merge_source_${sourceIndex}`;

/**
 * The compose form of a merge: the same MergeQueryBuilder assembly as the
 * warehouse statement, but in the DuckDB dialect over reference tables —
 * each source is `SELECT * FROM merge_source_N`, bound at execution time to
 * that source's already-materialized results. The join semantics (coalesced
 * keys, typed null placeholders, string casts, per-source row caps with
 * truncation detection) are identical by construction because the builder
 * and the key-option derivation are shared; only the dialect and where the
 * source rows come from differ.
 */
export const buildComposeMergeSql = (args: {
    mergeQuery: MergeQuery;
    fieldTypes: MergeFieldTypes;
    /** Output field-id alias per internal column, from the merge compile. */
    outputAliasByColumn: Record<string, string>;
    /** Row cap for the merged result, already clamped to the instance limit. */
    limit: number;
    /** Most rows one source may contribute; reaching it is reported, not trimmed. */
    sourceRowCap: number;
}): ComposeMergeSql => {
    const { mergeQuery, fieldTypes, outputAliasByColumn, limit, sourceRowCap } =
        args;
    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    );
    const quoteChar = warehouseSqlBuilder.getFieldQuoteChar();

    const referenceTableBySourceId = Object.fromEntries(
        mergeQuery.sources.map((source, index) => [
            source.id,
            composeMergeReferenceTable(index),
        ]),
    );

    const sources = mergeQuery.sources.map((source) => ({
        id: source.id,
        sql: `SELECT * FROM ${quoteChar}${
            referenceTableBySourceId[source.id]
        }${quoteChar}`,
        joinKeyColumnByName: Object.fromEntries(
            mergeQuery.joinKey.map((part) => [
                part.name,
                part.fieldIdBySourceId[source.id],
            ]),
        ),
        valueColumns: [
            ...source.metricQuery.metrics,
            ...source.metricQuery.tableCalculations.map(
                (calculation) => calculation.name,
            ),
        ],
    }));

    const { nullPlaceholderByKeyName, stringJoinKeyNames } =
        getMergeJoinKeySqlOptions(
            mergeQuery.joinKey,
            fieldTypes,
            warehouseSqlBuilder,
        );

    const builder = new MergeQueryBuilder({
        sources,
        joinKeyNames: mergeQuery.joinKey.map((part) => part.name),
        joinType: mergeQuery.joinType,
        warehouseSqlBuilder,
        limit,
        tableCalculations: mergeQuery.tableCalculations,
        nullPlaceholderByKeyName,
        stringJoinKeyNames,
        sourceRowCap,
    });

    return {
        coreSql: builder.toCoreSql(outputAliasByColumn),
        terminalWrapper: builder.buildTerminalWrapper(outputAliasByColumn),
        referenceTableBySourceId,
    };
};
