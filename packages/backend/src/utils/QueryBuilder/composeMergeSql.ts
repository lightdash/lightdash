import {
    SupportedDbtAdapter,
    type MergeFieldTypes,
    type MergeJoinKeyPart,
    type MergeJoinType,
    type MergeTableCalculation,
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
    /** Reference table name per source id, for binding to result queryUuids. */
    referenceTableBySourceId: Record<string, string>;
};

/** Table name a merge source's results are exposed under in the compose SQL. */
export const composeMergeReferenceTable = (sourceIndex: number): string =>
    `merge_source_${sourceIndex}`;

/**
 * The compose form of a merge: the same MergeQueryBuilder assembly as the
 * warehouse statement, but in the DuckDB dialect over reference tables —
 * each source is `SELECT * FROM merge_source_N`, bound at execution time to
 * that source's already-materialized results (a freshly-run leg or an
 * existing result referenced by queryUuid; the builder cannot tell and does
 * not care). The join semantics (coalesced keys, typed null placeholders,
 * string casts, per-source row caps with truncation detection) are identical
 * by construction because the builder and the key-option derivation are
 * shared; only the dialect and where the source rows come from differ.
 */
export const buildComposeMergeSql = (args: {
    /** Sources in merge order; value columns in the compile's column order. */
    sources: Array<{ id: string; valueColumns: string[] }>;
    joinKey: MergeJoinKeyPart[];
    joinType: MergeJoinType;
    tableCalculations: MergeTableCalculation[];
    fieldTypes: MergeFieldTypes;
    /** Output field-id alias per internal column, from the merge compile. */
    outputAliasByColumn: Record<string, string>;
    /** Row cap for the merged result, already clamped to the instance limit. */
    limit: number;
    /** Most rows one source may contribute; reaching it is reported, not trimmed. */
    sourceRowCap: number;
}): ComposeMergeSql => {
    const {
        sources,
        joinKey,
        joinType,
        tableCalculations,
        fieldTypes,
        outputAliasByColumn,
        limit,
        sourceRowCap,
    } = args;
    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    );
    const quoteChar = warehouseSqlBuilder.getFieldQuoteChar();

    const referenceTableBySourceId = Object.fromEntries(
        sources.map((source, index) => [
            source.id,
            composeMergeReferenceTable(index),
        ]),
    );

    const builderSources = sources.map((source) => ({
        id: source.id,
        sql: `SELECT * FROM ${quoteChar}${
            referenceTableBySourceId[source.id]
        }${quoteChar}`,
        joinKeyColumnByName: Object.fromEntries(
            joinKey.map((part) => [
                part.name,
                part.fieldIdBySourceId[source.id],
            ]),
        ),
        valueColumns: source.valueColumns,
    }));

    const { nullPlaceholderByKeyName, stringJoinKeyNames } =
        getMergeJoinKeySqlOptions(joinKey, fieldTypes, warehouseSqlBuilder);

    const builder = new MergeQueryBuilder({
        sources: builderSources,
        joinKeyNames: joinKey.map((part) => part.name),
        joinType,
        warehouseSqlBuilder,
        limit,
        tableCalculations,
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
