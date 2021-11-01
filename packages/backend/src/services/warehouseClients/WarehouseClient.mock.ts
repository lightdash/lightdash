import { DimensionType } from 'common';
import { WarehouseCatalog } from '../../types';

export const config: {
    database: string;
    schema: string;
    table: string;
    columns: string[];
}[] = [
    {
        database: 'myDatabase',
        schema: 'mySchema',
        table: 'myTable',
        columns: [
            'myStringColumn',
            'myNumberColumn',
            'myDateColumn',
            'myTimestampColumn',
            'myBooleanColumn',
            'myArrayColumn',
            'myObjectColumn',
        ],
    },
];

export const expectedWarehouseSchema: WarehouseCatalog = {
    myDatabase: {
        mySchema: {
            myTable: {
                myStringColumn: DimensionType.STRING,
                myNumberColumn: DimensionType.NUMBER,
                myDateColumn: DimensionType.DATE,
                myTimestampColumn: DimensionType.TIMESTAMP,
                myBooleanColumn: DimensionType.BOOLEAN,
                myArrayColumn: DimensionType.STRING,
                myObjectColumn: DimensionType.STRING,
            },
        },
    },
};

export const expectedRow: Record<string, any> = {
    myStringColumn: 'string value',
    myNumberColumn: 100,
    myDateColumn: new Date('2021-03-10T00:00:00.000Z'),
    myTimestampColumn: new Date('1990-03-02T08:30:00.010Z'),
    myBooleanColumn: false,
    myArrayColumn: '1,2,3',
    myObjectColumn: '[object Object]',
};
