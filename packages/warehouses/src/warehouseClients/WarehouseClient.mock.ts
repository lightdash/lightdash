import { DimensionType } from '@lightdash/common';
import { WarehouseCatalog } from '../types';

export const config: {
    database: string;
    schema: string;
    table: string;
}[] = [
    {
        database: 'myDatabase',
        schema: 'mySchema',
        table: 'myTable',
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

export const expectedFields: Record<string, any> = {
    myStringColumn: { type: DimensionType.STRING },
    myNumberColumn: { type: DimensionType.NUMBER },
    myDateColumn: { type: DimensionType.DATE },
    myTimestampColumn: { type: DimensionType.TIMESTAMP },
    myBooleanColumn: { type: DimensionType.BOOLEAN },
    myArrayColumn: { type: DimensionType.STRING },
    myObjectColumn: { type: DimensionType.STRING },
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
