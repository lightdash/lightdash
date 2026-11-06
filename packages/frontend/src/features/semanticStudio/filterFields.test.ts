import { describe, expect, it } from 'vitest';
import { fieldGroups, type Field } from './model';
import { filterFields } from './useSemanticStudio';

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
    it('hides internal fields that are not in use unless asked', () => {
        expect(names(filterFields(fields, 'all', '', false))).not.toContain(
            'raw_payload',
        );
        expect(names(filterFields(fields, 'all', '', false))).toContain(
            'kept_internal',
        );
        expect(names(filterFields(fields, 'all', '', true))).toContain(
            'raw_payload',
        );
    });

    it('filters by in use and missing description', () => {
        expect(names(filterFields(fields, 'notInUse', '', true))).toEqual([
            'email',
            'raw_payload',
        ]);
        expect(names(filterFields(fields, 'noDescription', '', true))).toEqual([
            'notes',
        ]);
    });

    it('matches label, name and definition, case-insensitively', () => {
        expect(names(filterFields(fields, 'all', 'ACCOUNT id', false))).toEqual(
            ['account_id'],
        );
        expect(names(filterFields(fields, 'all', 'amount_usd', false))).toEqual(
            ['revenue'],
        );
        expect(names(filterFields(fields, 'all', '  email ', false))).toEqual([
            'email',
        ]);
        expect(filterFields(fields, 'all', 'nothing-like-this', true)).toEqual(
            [],
        );
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
