import {
    ParameterError,
    type ModelMaterializationSample,
} from '@lightdash/common';
import { type ComposeEngineClient } from '../AsyncQueryService/ComposeEngineClient';

export async function readMaterializationSample(
    engine: ComposeEngineClient,
    bucket: string | null,
    objectKey: string,
): Promise<ModelMaterializationSample> {
    if (!bucket) throw new ParameterError('Model copy storage is unavailable.');
    const uri = `s3://${bucket}/${objectKey}`;
    try {
        const client = engine.createExecutionWarehouseClient({
            storage: 'modelMaterializations',
            scope: uri,
        });
        const { fields, rows } = await client.runQuery(
            `SELECT COLUMNS(*)::VARCHAR FROM read_parquet('${uri.replaceAll("'", "''")}', hive_partitioning=false) LIMIT 5`,
            {},
        );
        return {
            columns: Object.keys(fields),
            rows: rows.map((row) =>
                Object.fromEntries(
                    Object.entries(row).map(([column, value]) => [
                        column,
                        value === null ? null : String(value),
                    ]),
                ),
            ),
        };
    } catch {
        throw new ParameterError(
            'Could not read a sample from the model copy.',
        );
    }
}
