import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import { parse } from '@lightdash/formula';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Mention from '@tiptap/extension-mention';
import Paragraph from '@tiptap/extension-paragraph';
import TextExtension from '@tiptap/extension-text';
import { PluginKey } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import {
    generateFieldSuggestion,
    type FieldSuggestionItem,
} from './generateFieldSuggestion';

const dimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
};

const metric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT_DISTINCT,
    name: 'unique_customers',
    label: 'Unique Customers',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.customer_id',
    hidden: false,
};

const FIELDS: FieldSuggestionItem[] = [
    { id: 'orders_status', label: 'Status', item: dimension },
    { id: 'orders_unique_customers', label: 'Unique Customers', item: metric },
];

const suggestionPluginKey = new PluginKey('fieldSuggestionTest');

let editor: Editor | undefined;

const createEditor = (text: string) => {
    const suggestion = generateFieldSuggestion(FIELDS);
    editor = new Editor({
        extensions: [
            Document,
            Paragraph,
            TextExtension,
            Mention.configure({
                suggestion: {
                    ...suggestion,
                    allowedPrefixes: null,
                    pluginKey: suggestionPluginKey,
                    render: () => ({}),
                },
                renderText: ({ node }) =>
                    `${node.attrs.id ?? node.attrs.label}`,
            }),
        ],
        content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
    });
    return editor;
};

type ActiveSuggestion = {
    active: boolean;
    query: string | null;
    range: { from: number; to: number };
};

/**
 * Puts the cursor where `|` sits in the text and returns the suggestion state.
 */
const suggestionAt = (textWithCursor: string) => {
    const cursor = textWithCursor.indexOf('|');
    const text = textWithCursor.replace('|', '');
    const instance = createEditor(text);
    instance.commands.setTextSelection(cursor + 1);
    return {
        instance,
        state: suggestionPluginKey.getState(instance.state) as ActiveSuggestion,
    };
};

afterEach(() => {
    editor?.destroy();
    editor = undefined;
});

describe('generateFieldSuggestion', () => {
    it('keeps the picker open while a multi-word label is typed', () => {
        expect(suggestionAt('=@Unique Custom|').state).toMatchObject({
            active: true,
            query: 'Unique Custom',
        });
    });

    it('offers only the matching field for a multi-word query', () => {
        const { state } = suggestionAt('=@Unique Custom|');
        const matches = FIELDS.filter((field) =>
            field.label
                .toLowerCase()
                .includes((state.query ?? '').toLowerCase()),
        );
        expect(matches.map((field) => field.id)).toEqual([
            'orders_unique_customers',
        ]);
    });

    it('replaces the whole label when the cursor sits inside the query', () => {
        const { instance, state } = suggestionAt(
            '=RUNNING_TOTAL(@Unique| Customers)',
        );
        expect(state.query).toBe('Unique Customers');

        const suggestion = generateFieldSuggestion(FIELDS);
        suggestion.command?.({
            editor: instance,
            range: state.range,
            props: FIELDS[1],
        });

        expect(instance.getText()).toBe(
            '=RUNNING_TOTAL(orders_unique_customers )',
        );
    });

    it('produces a formula that parses', () => {
        const { instance, state } = suggestionAt(
            '=RUNNING_TOTAL(@Unique Customers|)',
        );
        const suggestion = generateFieldSuggestion(FIELDS);
        suggestion.command?.({
            editor: instance,
            range: state.range,
            props: FIELDS[1],
        });

        expect(() => parse(instance.getText())).not.toThrow();
    });

    it('replaces a single-word label without leftovers', () => {
        const { instance, state } = suggestionAt('=@Stat|us');
        expect(state.query).toBe('Status');

        const suggestion = generateFieldSuggestion(FIELDS);
        suggestion.command?.({
            editor: instance,
            range: state.range,
            props: FIELDS[0],
        });

        expect(instance.getText()).toBe('=orders_status ');
    });

    it('closes the picker once the text stops resembling a label', () => {
        expect(suggestionAt('=@Unique Customers + 1|').state).toMatchObject({
            active: false,
        });
    });
});
