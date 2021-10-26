import { DbtModelNode, DimensionType } from 'common';
import { WarehouseSchema } from '../../types';

export const model: DbtModelNode = {
    unique_id: 'unique_id',
    resource_type: 'resource_type',
    columns: {
        myStringColumn: {
            name: 'myStringColumn',
            meta: {},
        },
        myNumberColumn: {
            name: 'myNumberColumn',
            meta: {},
        },
        myDateColumn: {
            name: 'myDateColumn',
            meta: {},
        },
        myTimestampColumn: {
            name: 'myTimestampColumn',
            meta: {},
        },
        myBooleanColumn: {
            name: 'myBooleanColumn',
            meta: {},
        },
    },
    meta: {},
    database: 'myDatabase',
    schema: 'mySchema',
    name: 'myTable',
    relation_name: 'relation_name',
    depends_on: { nodes: [] },
    root_path: 'root_path',
    patch_path: null,
};

export const expectedWarehouseSchema: WarehouseSchema = {
    [model.schema]: {
        [model.name]: {
            myStringColumn: DimensionType.STRING,
            myNumberColumn: DimensionType.NUMBER,
            myDateColumn: DimensionType.DATE,
            myTimestampColumn: DimensionType.TIMESTAMP,
            myBooleanColumn: DimensionType.BOOLEAN,
        },
    },
};

export const expectedRow: Record<string, any> = {
    myStringColumn: 'string value',
    myNumberColumn: 100,
    myDateColumn: new Date('2021-03-10T00:00:00.000Z'),
    myTimestampColumn: new Date('1990-03-02T08:30:00.010Z'),
    myBooleanColumn: false,
};
