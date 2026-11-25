import { describe, expect, it } from 'vitest';
import { fieldGroups, type Field } from './model';
import { filterFields } from './useFieldListState';

const field = (name: string, overrides: Partial<Field> = {}): Field => ({
    id: `t_${name}`,
    name,
    label: name,
    fieldKind: 'dimension',
    type: 'string',
    table: 't',
    tableLabel: 'T',
    description: 'Has one',
    aiHint: '',
    group: '',
    inUse: true,
    definition: { label: 'SQL', value: `\${TABLE}.${name}` },
    visibleTo: null,
    isInternal: false,
    isRequired: false,
    chartUsage: null,
    lastEdit: null,
    draftState: null,
    ...overrides,
});

const fields = [
    field('account_id', { label: 'Account ID' }),
    field('email', { inUse: false }),
    field('raw_payload', { isInternal: true, inUse: false }),
    field('kept_internal', { isInternal: true, inUse: true }),
    field('notes', { description: '  ' }),
    field('revenue', {
        definition: { label: 'SQL', value: 'SUM(amount_usd)' },
    }),
];
const names = (list: Field[]) => list.map(({ name }) => name);

describe('filterFields', () => {
    it('shows every field but internal ones not in use', () => {
        expect(names(filterFields(fields, ''))).toEqual([
            'account_id',
            'email',
            'kept_internal',
            'notes',
            'revenue',
        ]);
    });

    it('matches label, name and definition, case-insensitively', () => {
        expect(names(filterFields(fields, 'ACCOUNT id'))).toEqual([
            'account_id',
        ]);
        expect(names(filterFields(fields, 'amount_usd'))).toEqual(['revenue']);
        expect(names(filterFields(fields, '  email '))).toEqual(['email']);
        expect(filterFields(fields, 'nothing-like-this')).toEqual([]);
    });
});

describe('fieldGroups', () => {
    it('lists each group once, by name, without the ungrouped', () => {
        expect(
            fieldGroups([
                field('a', { group: 'Session' }),
                field('b', { group: '' }),
                field('c', { group: 'Person' }),
                field('d', { group: ' Session ' }),
                field('e', { group: '   ' }),
            ]),
        ).toEqual(['Person', 'Session']);
    });
});
