import {
    AnyType,
    DimensionType,
    setCatalogTimestampDomain,
    type TimestampDomain,
} from '@lightdash/common';
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

const schemaWithTimestampDomain = (
    timestampDomain: TimestampDomain,
): WarehouseCatalog => {
    const catalog = structuredClone(expectedWarehouseSchema);
    setCatalogTimestampDomain(
        catalog,
        'myDatabase',
        'mySchema',
        'myTable',
        'myTimestampColumn',
        timestampDomain,
    );
    return catalog;
};

export const expectedWarehouseSchemaWithNaiveTimestamp =
    schemaWithTimestampDomain('naive');

export const expectedWarehouseSchemaWithAwareTimestamp =
    schemaWithTimestampDomain('aware');

export const expectedFields: Record<string, AnyType> = {
    myStringColumn: { type: DimensionType.STRING },
    myNumberColumn: { type: DimensionType.NUMBER },
    myDateColumn: { type: DimensionType.DATE },
    myTimestampColumn: { type: DimensionType.TIMESTAMP },
    myBooleanColumn: { type: DimensionType.BOOLEAN },
    myArrayColumn: { type: DimensionType.STRING },
    myObjectColumn: { type: DimensionType.STRING },
};

export const expectedFieldsWithNaiveTimestamp: Record<string, AnyType> = {
    ...expectedFields,
    myTimestampColumn: {
        type: DimensionType.TIMESTAMP,
        timestampDomain: 'naive',
    },
};

export const expectedFieldsWithAwareTimestamp: Record<string, AnyType> = {
    ...expectedFields,
    myTimestampColumn: {
        type: DimensionType.TIMESTAMP,
        timestampDomain: 'aware',
    },
};

export const expectedRow: Record<string, AnyType> = {
    myStringColumn: 'string value',
    myNumberColumn: 100,
    myDateColumn: new Date('2021-03-10T00:00:00.000Z'),
    myTimestampColumn: new Date('1990-03-02T08:30:00.010Z'),
    myBooleanColumn: false,
    myArrayColumn: '1,2,3',
    myObjectColumn: '[object Object]',
};
