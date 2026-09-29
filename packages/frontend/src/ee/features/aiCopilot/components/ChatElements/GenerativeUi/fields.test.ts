import {
    everyBlockSpecMock,
    moveChartsSpecMock,
} from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { describe, expect, it } from 'vitest';
import {
    fieldsOf,
    forEachStateKeysOf,
    formatFieldValue,
    initialStateOf,
    validateFields,
    type GenerativeUiField,
} from './fields';

const field = (overrides: Partial<GenerativeUiField>): GenerativeUiField => ({
    kind: 'input',
    key: 'name',
    label: 'Name',
    required: false,
    initial: '',
    visibleWhen: undefined,
    staticOptions: null,
    ...overrides,
});

describe('fieldsOf', () => {
    it('finds every input in nested blocks with its initial value', () => {
        const fields = fieldsOf(everyBlockSpecMock.blocks);

        expect(initialStateOf(fields)).toEqual({
            name: '',
            order: 1,
            reviewOn: '2026-10-01',
            nested: false,
            parentSpaceUuid: null,
            notes: '',
            access: 'inherit',
            tags: ['finance'],
        });
    });

    it('treats a table selection as a field labelled by its first column', () => {
        expect(fieldsOf(moveChartsSpecMock.blocks)).toEqual([
            expect.objectContaining({ kind: 'input', key: 'spaceUuid' }),
            expect.objectContaining({
                kind: 'selection',
                key: 'chartUuids',
                label: 'Chart',
                initial: [],
            }),
        ]);
    });
});

describe('validateFields', () => {
    it('requires visible required fields and a selection for every forEach source', () => {
        const fields = [
            field({ key: 'name', required: true }),
            field({
                key: 'parent',
                required: true,
                visibleWhen: { $state: 'nested', equals: true },
            }),
            field({ key: 'chartUuids', kind: 'selection', initial: [] }),
        ];

        expect(
            validateFields(
                fields,
                { name: '', parent: null, nested: false, chartUuids: [] },
                forEachStateKeysOf(moveChartsSpecMock),
            ),
        ).toEqual({ name: 'Required', chartUuids: 'Select at least one' });
    });
});

describe('formatFieldValue', () => {
    it('prints values the way the user saw them', () => {
        const options = [{ label: 'Weekly', value: 'weekly' }];

        expect(
            formatFieldValue(field({ staticOptions: options }), 'weekly'),
        ).toBe('Weekly');
        expect(formatFieldValue(field({}), true)).toBe('Yes');
        expect(formatFieldValue(field({}), null)).toBe('—');
        expect(
            formatFieldValue(field({ kind: 'selection' }), ['c-1', 'c-2']),
        ).toBe('2 selected');
        expect(formatFieldValue(field({}), ['a', 'b'])).toBe('a, b');
    });
});
