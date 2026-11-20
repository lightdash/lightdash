import { WarehouseTypes } from '@lightdash/common';
import type { TableRef } from './tableRows';

const quoteParts = (parts: string[], quoteChar: string): string =>
    parts
        .filter((part) => part !== '')
        .map((part) => `${quoteChar}${part}${quoteChar}`)
        .join('.');

export const quoteTable = (
    { database, schema, table }: TableRef,
    quoteChar: string,
) => quoteParts([database, schema, table], quoteChar);

export const quoteTableForQuery = (
    { database, schema, table }: TableRef,
    quoteChar: string,
    hasSeveralDatabases: boolean,
    warehouseType: WarehouseTypes | undefined,
): string =>
    quoteParts(
        hasSeveralDatabases || warehouseType === WarehouseTypes.BIGQUERY
            ? [database, schema, table]
            : [schema, table],
        quoteChar,
    );
