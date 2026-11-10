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

const visible = { showHidden: false, showInternal: false };
const everything = { showHidden: true, showInternal: true };

describe('filterFields', () => {
    it('hides fields not in use until asked', () => {
        expect(names(filterFields(fields, 'all', '', visible))).toEqual([
            'account_id',
            'kept_internal',
            'notes',
            'revenue',
        ]);
        expect(
            names(
                filterFields(fields, 'all', '', {
                    showHidden: true,
                    showInternal: false,
                }),
            ),
        ).toEqual(['account_id', 'email', 'kept_internal', 'notes', 'revenue']);
    });

    it('shows internal fields not in use only with internal fields on', () => {
        const withInternal = { showHidden: false, showInternal: true };
        expect(names(filterFields(fields, 'all', '', withInternal))).toContain(
            'raw_payload',
        );
        expect(
            names(filterFields(fields, 'all', '', withInternal)),
        ).not.toContain('email');
    });

    it('filters by missing description', () => {
        expect(
            names(filterFields(fields, 'noDescription', '', everything)),
        ).toEqual(['notes']);
    });

    it('matches label, name and definition, case-insensitively', () => {
        expect(
            names(filterFields(fields, 'all', 'ACCOUNT id', visible)),
        ).toEqual(['account_id']);
        expect(
            names(filterFields(fields, 'all', 'amount_usd', visible)),
        ).toEqual(['revenue']);
        expect(
            names(filterFields(fields, 'all', '  email ', everything)),
        ).toEqual(['email']);
        expect(
            filterFields(fields, 'all', 'nothing-like-this', everything),
        ).toEqual([]);
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
