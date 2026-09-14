import { TTypeId as DatabricksDataTypes } from '@databricks/sql/thrift/TCLIService_types';
import { describe, expect, it } from 'vitest';
import { getAthenaNumericKind } from './AthenaWarehouseClient';
import { getBigqueryNumericKind } from './BigqueryWarehouseClient';
import { getClickhouseNumericKind } from './ClickhouseWarehouseClient';
import { getDatabricksNumericKind } from './DatabricksWarehouseClient';
import { getSnowflakeNumericKind } from './SnowflakeWarehouseClient';
import { getTrinoNumericKind } from './TrinoWarehouseClient';

// The typed read binds a NUMBER column by the kind its driver reports; a
// column without one binds as DOUBLE and loses digits above 2^53
describe('numeric kinds reported by warehouse drivers', () => {
    describe('Snowflake', () => {
        it('reads NUMBER with scale 0 as an integer and with a scale as a decimal', () => {
            expect(getSnowflakeNumericKind('FIXED', 0)).toEqual({
                kind: 'integer',
            });
            expect(getSnowflakeNumericKind('NUMBER', 4)).toEqual({
                kind: 'decimal',
                scale: 4,
            });
            expect(getSnowflakeNumericKind('fixed', 2)).toEqual({
                kind: 'decimal',
                scale: 2,
            });
        });

        it('reads REAL as a float and reports nothing without a scale or for other types', () => {
            expect(getSnowflakeNumericKind('REAL', 0)).toEqual({
                kind: 'float',
            });
            expect(getSnowflakeNumericKind('FIXED', undefined)).toBeNull();
            expect(getSnowflakeNumericKind('TEXT', 0)).toBeNull();
        });
    });

    describe('BigQuery', () => {
        it('reads INT64 as an integer and FLOAT64 as a float', () => {
            expect(getBigqueryNumericKind({ type: 'INTEGER' })).toEqual({
                kind: 'integer',
            });
            expect(getBigqueryNumericKind({ type: 'INT64' })).toEqual({
                kind: 'integer',
            });
            expect(getBigqueryNumericKind({ type: 'FLOAT64' })).toEqual({
                kind: 'float',
            });
        });

        it('reads NUMERIC at its declared scale, else at the default of 9', () => {
            expect(
                getBigqueryNumericKind({ type: 'NUMERIC', scale: '2' }),
            ).toEqual({ kind: 'decimal', scale: 2 });
            expect(getBigqueryNumericKind({ type: 'NUMERIC' })).toEqual({
                kind: 'decimal',
                scale: 9,
            });
        });

        it('reads BIGNUMERIC only when its declared precision fits a DuckDB decimal', () => {
            expect(
                getBigqueryNumericKind({
                    type: 'BIGNUMERIC',
                    precision: '30',
                    scale: '4',
                }),
            ).toEqual({ kind: 'decimal', scale: 4 });
            expect(getBigqueryNumericKind({ type: 'BIGNUMERIC' })).toBeNull();
            expect(
                getBigqueryNumericKind({ type: 'BIGNUMERIC', scale: '4' }),
            ).toBeNull();
            expect(
                getBigqueryNumericKind({
                    type: 'BIGNUMERIC',
                    precision: '60',
                    scale: '4',
                }),
            ).toBeNull();
            expect(getBigqueryNumericKind({ type: 'STRING' })).toBeNull();
        });
    });

    describe('Trino', () => {
        it('reads the kind and the decimal scale from the column type string', () => {
            expect(getTrinoNumericKind('bigint')).toEqual({ kind: 'integer' });
            expect(getTrinoNumericKind('tinyint')).toEqual({
                kind: 'integer',
            });
            expect(getTrinoNumericKind('double')).toEqual({ kind: 'float' });
            expect(getTrinoNumericKind('real')).toEqual({ kind: 'float' });
            expect(getTrinoNumericKind('decimal(10,2)')).toEqual({
                kind: 'decimal',
                scale: 2,
            });
            expect(getTrinoNumericKind('decimal(38, 0)')).toEqual({
                kind: 'decimal',
                scale: 0,
            });
        });

        it('reports nothing for a decimal without a scale or for other types', () => {
            expect(getTrinoNumericKind('decimal')).toBeNull();
            expect(getTrinoNumericKind('varchar')).toBeNull();
        });
    });

    describe('Databricks', () => {
        it('reads integers, floats and a decimal with its scale qualifier', () => {
            expect(
                getDatabricksNumericKind({
                    type: DatabricksDataTypes.BIGINT_TYPE,
                }),
            ).toEqual({ kind: 'integer' });
            expect(
                getDatabricksNumericKind({
                    type: DatabricksDataTypes.DOUBLE_TYPE,
                }),
            ).toEqual({ kind: 'float' });
            expect(
                getDatabricksNumericKind({
                    type: DatabricksDataTypes.DECIMAL_TYPE,
                    typeQualifiers: {
                        qualifiers: {
                            precision: { i32Value: 18 },
                            scale: { i32Value: 3 },
                        },
                    },
                }),
            ).toEqual({ kind: 'decimal', scale: 3 });
        });

        it('reports nothing for a decimal without a scale qualifier or for other types', () => {
            expect(
                getDatabricksNumericKind({
                    type: DatabricksDataTypes.DECIMAL_TYPE,
                }),
            ).toBeNull();
            expect(
                getDatabricksNumericKind({
                    type: DatabricksDataTypes.STRING_TYPE,
                }),
            ).toBeNull();
        });
    });

    describe('ClickHouse', () => {
        it('reads integers and floats through Nullable and LowCardinality wrappers', () => {
            expect(getClickhouseNumericKind('Int64')).toEqual({
                kind: 'integer',
            });
            expect(getClickhouseNumericKind('Nullable(UInt64)')).toEqual({
                kind: 'integer',
            });
            expect(
                getClickhouseNumericKind('LowCardinality(Nullable(Float64))'),
            ).toEqual({ kind: 'float' });
        });

        it('reads the scale of Decimal(P, S), the spelling the server sends for every decimal', () => {
            expect(getClickhouseNumericKind('Decimal(18, 4)')).toEqual({
                kind: 'decimal',
                scale: 4,
            });
            expect(getClickhouseNumericKind('Nullable(Decimal(10,2))')).toEqual(
                { kind: 'decimal', scale: 2 },
            );
            expect(getClickhouseNumericKind('Decimal(38, 10)')).toEqual({
                kind: 'decimal',
                scale: 10,
            });
        });

        it('reports nothing for a decimal wider than 38 digits or for other types', () => {
            expect(getClickhouseNumericKind('Decimal(76, 10)')).toBeNull();
            expect(getClickhouseNumericKind('String')).toBeNull();
        });
    });

    describe('Athena', () => {
        it('reads integers, floats and a decimal with the scale ColumnInfo reports', () => {
            expect(getAthenaNumericKind('bigint', 0)).toEqual({
                kind: 'integer',
            });
            expect(getAthenaNumericKind('double', 0)).toEqual({
                kind: 'float',
            });
            expect(getAthenaNumericKind('decimal', 2)).toEqual({
                kind: 'decimal',
                scale: 2,
            });
            expect(getAthenaNumericKind('decimal(10,2)', 2)).toEqual({
                kind: 'decimal',
                scale: 2,
            });
        });

        it('reports nothing for a decimal without a scale or for other types', () => {
            expect(getAthenaNumericKind('decimal', undefined)).toBeNull();
            expect(getAthenaNumericKind('varchar', undefined)).toBeNull();
        });
    });
});
