import { DimensionType, FieldType, type ItemsMap } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildTableEditorState } from './tableEditorSlice';

const itemsMap: ItemsMap = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    },
};

describe('buildTableEditorState show table names seed', () => {
    it('keeps a saved value', () => {
        expect(
            buildTableEditorState(
                { showTableNames: false },
                { itemsMap, hasConfigOwner: false },
            ).showTableNames,
        ).toBe(false);
    });

    it('takes the items default when the items are loaded at mount', () => {
        expect(
            buildTableEditorState(undefined, { itemsMap, hasConfigOwner: true })
                .showTableNames,
        ).toBe(true);
    });

    it('is off for an owner whose items load after mount', () => {
        expect(
            buildTableEditorState(undefined, {
                itemsMap: undefined,
                hasConfigOwner: true,
            }).showTableNames,
        ).toBe(false);
    });

    it('stays unset without an owner so the items default applies later', () => {
        expect(
            buildTableEditorState(undefined, {
                itemsMap: undefined,
                hasConfigOwner: false,
            }).showTableNames,
        ).toBeUndefined();
    });
});
