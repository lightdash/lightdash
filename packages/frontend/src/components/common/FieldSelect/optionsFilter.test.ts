import { type ComboboxParsedItem } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import {
    ADD_TO_QUERY_GROUP_LABEL,
    MORE_OPTIONS_VALUE,
    optionsFilter,
} from './optionsFilter';

const table = (name: string, fields: string[]) => ({
    group: name,
    items: fields.map((f) => ({ value: `${name}_${f}`, label: f })),
});

const fieldNames = (count: number) =>
    Array.from({ length: count }, (_, i) => `Field ${i}`);

const values = (result: ComboboxParsedItem[]) =>
    result
        .flatMap((item) =>
            'group' in item ? item.items.map((o) => o.value) : [item.value],
        )
        .filter((value) => value !== MORE_OPTIONS_VALUE);

const moreRow = (result: ComboboxParsedItem[]) =>
    result.find(
        (item) => !('group' in item) && item.value === MORE_OPTIONS_VALUE,
    );

const groups = (result: ComboboxParsedItem[]) =>
    result.flatMap((item) => ('group' in item ? [item.group] : []));

describe('FieldSelect optionsFilter', () => {
    const manyTables = [
        table('Base', fieldNames(60)),
        ...Array.from({ length: 50 }, (_, i) =>
            table(`Joined ${String(i).padStart(2, '0')}`, [
                'First name',
                'Last name',
            ]),
        ),
        table('Zulu tail', ['First name', 'Last name']),
    ];

    it('keeps every table group when there are more tables than the limit', () => {
        const result = optionsFilter({
            options: manyTables,
            search: '',
            limit: 50,
        });
        expect(groups(result)).toHaveLength(52);
        expect(groups(result)).toContain('Zulu tail');
    });

    it('lists a late-sorting table when its field label is searched', () => {
        const result = optionsFilter({
            options: manyTables,
            search: 'first name',
            limit: 50,
        });
        expect(values(result)).toContain('Zulu tail_First name');
    });

    it('matches the table group label', () => {
        const result = optionsFilter({
            options: manyTables,
            search: 'zulu first',
            limit: 50,
        });
        expect(values(result)).toEqual(['Zulu tail_First name']);
    });

    it('spends the remaining budget in order', () => {
        const result = optionsFilter({
            options: [
                table('Base', fieldNames(30)),
                table('Orders', fieldNames(30)),
                table('Payments', fieldNames(30)),
            ],
            search: '',
            limit: 50,
        });
        expect(
            result.flatMap((g) => ('group' in g ? [g.items.length] : [])),
        ).toEqual([30, 19, 1]);
    });

    it('keeps the ungrouped limit unchanged', () => {
        const result = optionsFilter({
            options: fieldNames(80).map((f) => ({ value: f, label: f })),
            search: '',
            limit: 50,
        });
        expect(values(result)).toHaveLength(50);
    });

    it('closes a cut list with a disabled row carrying the hidden count', () => {
        const result = optionsFilter({
            options: manyTables,
            search: '',
            limit: 50,
        });
        // 60 + 51 * 2 fields, 52 shown (one per table)
        expect(moreRow(result)).toEqual({
            value: MORE_OPTIONS_VALUE,
            label: '110',
            disabled: true,
        });
        expect(result[result.length - 1]).toBe(moreRow(result));
    });

    it('adds no count row when nothing is cut', () => {
        const result = optionsFilter({
            options: manyTables,
            search: 'zulu',
            limit: 50,
        });
        expect(moreRow(result)).toBeUndefined();
    });

    it('does not match synthetic group labels', () => {
        const result = optionsFilter({
            options: [table(ADD_TO_QUERY_GROUP_LABEL, ['Amount'])],
            search: 'query',
            limit: 50,
        });
        expect(result).toEqual([]);
    });
});
