import { ParameterError } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    type DuckdbS3SessionConfig,
    type PostgresNativeField,
    type PostgresWarehouseClient,
} from '@lightdash/warehouses';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { types } from 'pg';
import { quoteDuckdbIdentifier } from '../../utils/duckdb/duckdbSqlTables';

type NativeColumn = PostgresNativeField & { duckdbType: string };

const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

const getDuckdbType = ({
    dataTypeID,
    dataTypeModifier,
}: PostgresNativeField) => {
    switch (dataTypeID) {
        case types.builtins.BOOL:
            return 'BOOLEAN';
        case types.builtins.INT8:
            return 'BIGINT';
        case types.builtins.INT2:
            return 'SMALLINT';
        case types.builtins.INT4:
            return 'INTEGER';
        case types.builtins.TEXT:
        case types.builtins.VARCHAR:
        case types.builtins.BPCHAR:
            return 'VARCHAR';
        case types.builtins.FLOAT4:
            return 'FLOAT';
        case types.builtins.FLOAT8:
            return 'DOUBLE';
        case types.builtins.DATE:
            return 'DATE';
        case types.builtins.TIMESTAMP:
            return 'TIMESTAMP';
        case types.builtins.TIMESTAMPTZ:
            return 'TIMESTAMP WITH TIME ZONE';
        case types.builtins.NUMERIC: {
            const modifier = dataTypeModifier - 4;
            const precision = Math.floor(modifier / 65536);
            const scale = modifier % 65536;
            if (precision < 1 || precision > 38 || scale > precision) break;
            return `DECIMAL(${precision},${scale})`;
        }
        default:
            break;
    }
    throw new ParameterError(
        'Unsupported Postgres column type or precision for materialization',
    );
};

export const buildModelMaterialization = async ({
    warehouse,
    sourceSql,
    maxRows,
    parquetUri,
    s3Config,
}: {
    warehouse: Pick<PostgresWarehouseClient, 'streamMaterializationRows'>;
    sourceSql: string;
    maxRows: number;
    parquetUri: string;
    s3Config: DuckdbS3SessionConfig;
}) => {
    const directory = await mkdtemp(join(tmpdir(), 'model-materialization-'));
    try {
        const jsonl = join(directory, 'rows.jsonl');
        const file = await open(jsonl, 'wx', 0o600);
        let nativeSchema: NativeColumn[] = [];
        const result = await warehouse
            .streamMaterializationRows(
                sourceSql,
                maxRows,
                (fields) => {
                    if (
                        fields.length === 0 ||
                        new Set(fields.map(({ name }) => name.toLowerCase()))
                            .size !== fields.length
                    ) {
                        throw new ParameterError(
                            'Materialization requires uniquely named columns',
                        );
                    }
                    nativeSchema = fields.map((field) => ({
                        name: field.name,
                        dataTypeID: field.dataTypeID,
                        dataTypeModifier: field.dataTypeModifier,
                        duckdbType: getDuckdbType(field),
                    }));
                },
                async (rows) => {
                    const lines = rows.map((row) =>
                        JSON.stringify(
                            Object.fromEntries(
                                row.map((value, i) => [`c${i}`, value]),
                            ),
                        ),
                    );
                    await file.writeFile(`${lines.join('\n')}\n`);
                },
            )
            .finally(() => file.close());

        const fields = nativeSchema.map(({ name, duckdbType }, i) => {
            const input = result.rowCount === 0 ? 'NULL' : `c${i}`;
            return `CAST(${input} AS ${duckdbType}) AS ${quoteDuckdbIdentifier(name)}`;
        });
        const columns = nativeSchema
            .map((_, i) => `c${i}: 'VARCHAR'`)
            .join(', ');
        const from =
            result.rowCount === 0
                ? 'WHERE FALSE'
                : `FROM read_json(${sqlLiteral(jsonl)}, columns={${columns}}, format='newline_delimited')`;
        const target = sqlLiteral(parquetUri);
        const duckdb = DuckdbWarehouseClient.createForPreAggregate(
            { type: 'duckdb_s3', s3Config },
            { resourceLimits: { memoryLimit: '256MB', threads: 1 } },
        );
        await duckdb.runSql(
            `COPY (SELECT ${fields.join(', ')} ${from}) TO ${target} (FORMAT PARQUET, COMPRESSION zstd)`,
        );
        const schema = await duckdb.runQuery(
            `SELECT column_name, column_type FROM (DESCRIBE SELECT * FROM read_parquet(${target}, hive_partitioning=false))`,
        );
        if (
            schema.rows.length !== nativeSchema.length ||
            nativeSchema.some(
                ({ name, duckdbType }, i) =>
                    schema.rows[i].column_name !== name ||
                    schema.rows[i].column_type !== duckdbType,
            )
        ) {
            throw new Error(
                'Materialization object schema verification failed',
            );
        }
        const metadata = await duckdb.runQuery(
            `SELECT num_rows, file_size_bytes FROM parquet_file_metadata(${target})`,
        );
        const byteCount = Number(metadata.rows[0]?.file_size_bytes);
        if (
            metadata.rows.length !== 1 ||
            Number(metadata.rows[0].num_rows) !== result.rowCount ||
            !Number.isSafeInteger(byteCount) ||
            byteCount <= 0
        ) {
            throw new Error(
                'Materialization object metadata verification failed',
            );
        }
        return { ...result, byteCount, nativeSchema };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
};
