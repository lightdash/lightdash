import {
    CompiledDimension,
    CompiledTable,
    DimensionType,
    Explore,
    FieldType,
    SupportedDbtAdapter,
} from '@lightdash/common';

const generateCompiledDimension = (
    name: string,
    type: DimensionType,
): CompiledDimension => {
    return {
        compiledSql: '',
        fieldType: FieldType.DIMENSION,
        hidden: false,
        label: '',
        name: name,
        sql: '',
        table: 'dimension',
        tableLabel: '',
        type: type,
    };
};

const compiledTable: CompiledTable = {
    name: 'dimension',
    label: 'Dimension',
    database: '',
    schema: '',
    sqlTable: 'dimension',
    dimensions: {
        string: generateCompiledDimension('string', DimensionType.STRING),
        date_1: generateCompiledDimension('date_1', DimensionType.DATE),
        date_2: generateCompiledDimension('date_2', DimensionType.DATE),
        boolean: generateCompiledDimension('date_1', DimensionType.BOOLEAN),
        timestamp: generateCompiledDimension(
            'timestamp',
            DimensionType.TIMESTAMP,
        ),
    },
    metrics: {},
    lineageGraph: {},
};
export const explore: Explore = {
    name: '',
    label: '',
    tags: [],
    baseTable: '',
    joinedTables: [],
    tables: { dimension: compiledTable },
    targetDatabase: SupportedDbtAdapter.BIGQUERY,
};
