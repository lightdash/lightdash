import { type DbtRawModelNode } from '../types/dbt';
import { MetricType } from '../types/field';

const baseModel: DbtRawModelNode = {
    alias: '',
    checksum: { name: '', checksum: '' },
    fqn: [],
    language: '',
    package_name: '',
    path: '',
    raw_code: '',
    compiled: true,
    unique_id: 'unique_id',
    description: 'my fun table',
    resource_type: 'model',
    columns: {},
    meta: {},
    database: 'myDatabase',
    schema: 'mySchema',
    name: 'myTable',
    tags: [],
    relation_name: 'relation_name',
    depends_on: { nodes: [] },
    patch_path: null,
    original_file_path: '',
};

export const modelWithWrongDimensionFormat: DbtRawModelNode = {
    ...baseModel,
    columns: {
        test: {
            name: 'test',
            meta: {
                dimension: {
                    // @ts-ignore
                    format: 'number',
                },
            },
        },
    },
};

export const modelWithWrongMetricFormat: DbtRawModelNode = {
    ...baseModel,
    columns: {
        test: {
            name: 'test',
            meta: {
                metrics: {
                    test2: {
                        type: MetricType.SUM,
                        // @ts-ignore
                        format: 'number',
                    },
                },
            },
        },
    },
};
