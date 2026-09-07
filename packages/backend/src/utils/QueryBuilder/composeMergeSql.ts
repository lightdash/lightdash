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
    /** Terminal stage (sort, limit) for the run path to attach. */
    terminalWrapper: MergeTerminalWrapper;
    /** Reference table name per source id, for binding to result queryUuids. */
    referenceTableBySourceId: Record<string, string>;
};

/** Table name a merge source's results are exposed under in the join SQL. */
export const composeMergeReferenceTable = (sourceIndex: number): string =>
    `merge_source_${sourceIndex}`;

type ComposeMergeArgs = {
    /** Sources in merge order; value columns in the compile's column order. */
    sources: Array<{ id: string; valueColumns: string[] }>;
    joinKey: MergeJoinKeyPart[];
    joinType: MergeJoinType;
    tableCalculations: MergeTableCalculation[];
    fieldTypes: MergeFieldTypes;
    /** Row cap for the merged result, already clamped to the instance limit. */
    limit: number;
};

/**
 * The join of a merge, in the DuckDB dialect over reference tables: each
 * source is `SELECT * FROM merge_source_N`, bound at execution time to that
 * source's already-materialized results (a freshly-run leg or an existing
 * result referenced by queryUuid; the builder cannot tell and does not
 * care).
 *
 * No source row cap here: the sources are legs that already ran at the cap,
 * so a cap in this statement could never see past it. The run path reads
 * the legs' own row counts instead (getMergeRowCapError).
 */
export const createComposeMergeQueryBuilder = (
    args: ComposeMergeArgs,
): {
    builder: MergeQueryBuilder;
    referenceTableBySourceId: Record<string, string>;
} => {
    const { sources, joinKey, joinType, tableCalculations, fieldTypes, limit } =
        args;
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

    const { stringJoinKeyNames } = getMergeJoinKeySqlOptions(
        joinKey,
        fieldTypes,
    );

    const builder = new MergeQueryBuilder({
        sources: builderSources,
        joinKeyNames: joinKey.map((part) => part.name),
        joinType,
        warehouseSqlBuilder,
        limit,
        tableCalculations,
        stringJoinKeyNames,
    });

    return { builder, referenceTableBySourceId };
};

/** The join SQL in one call, for callers that already know their aliases. */
export const buildComposeMergeSql = (
    args: ComposeMergeArgs & {
        /** Output field-id alias per internal column, from the merge compile. */
        outputAliasByColumn: Record<string, string>;
    },
): ComposeMergeSql => {
    const { outputAliasByColumn, ...builderArgs } = args;
    const { builder, referenceTableBySourceId } =
        createComposeMergeQueryBuilder(builderArgs);
    return {
        coreSql: builder.toCoreSql(outputAliasByColumn),
        terminalWrapper: builder.buildTerminalWrapper(outputAliasByColumn),
        referenceTableBySourceId,
    };
};
