import {
    diffDataAppVizSchema,
    hasDataAppVizSchemaChanges,
    summarizeDataAppVizSchemaChanges,
} from './dataAppVizSchemaChanges';
import { type DataAppVizSchema } from './types';

const base: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        { name: 'value', label: 'Value', type: 'metric', required: true },
        { name: 'series', label: 'Series', type: 'series', required: false },
    ],
    configOptions: [
        {
            type: 'boolean',
            name: 'showLegend',
            label: 'Show legend',
            default: true,
        },
        {
            type: 'select',
            name: 'mode',
            label: 'Mode',
            choices: [
                { value: 'stacked', label: 'Stacked' },
                { value: 'grouped', label: 'Grouped' },
            ],
            default: 'stacked',
        },
        { type: 'number', name: 'limit', label: 'Limit', default: 10, min: 1 },
    ],
    colorPalette: null,
};

describe('diffDataAppVizSchema', () => {
    it('reports nothing for identical declarations', () => {
        const changes = diffDataAppVizSchema(base, structuredClone(base));

        expect(hasDataAppVizSchemaChanges(changes)).toBe(false);
        expect(summarizeDataAppVizSchemaChanges(changes)).toEqual([]);
    });

    it('keeps existing bindings when only field help changes', () => {
        const changes = diffDataAppVizSchema(base, {
            ...base,
            fields: base.fields.map((field) =>
                field.name === 'category'
                    ? {
                          ...field,
                          description: 'Category for each row',
                          examples: ['New', 'Returning'],
                      }
                    : field,
            ),
            inputGuidance: 'One row per category.',
        });

        expect(hasDataAppVizSchemaChanges(changes)).toBe(false);
    });

    it('reports an omitted scalar declaration changing to multiple', () => {
        const changes = diffDataAppVizSchema(base, {
            ...base,
            fields: base.fields.map((field) =>
                field.name === 'value' ? { ...field, multiple: true } : field,
            ),
        });

        expect(changes.fields.changed).toEqual([
            {
                before: base.fields[1],
                after: { ...base.fields[1], multiple: true },
            },
        ]);
        expect(hasDataAppVizSchemaChanges(changes)).toBe(true);
    });

    it('tracks added, removed and retyped fields by name', () => {
        const changes = diffDataAppVizSchema(base, {
            ...base,
            fields: [
                {
                    name: 'category',
                    label: 'Category',
                    type: 'dimension',
                    required: true,
                },
                {
                    name: 'value',
                    label: 'Value',
                    type: 'metric',
                    required: false,
                },
                {
                    name: 'target',
                    label: 'Target',
                    type: 'metric',
                    required: true,
                },
            ],
        });

        expect(changes.fields.added.map((f) => f.name)).toEqual(['target']);
        expect(changes.fields.removed.map((f) => f.name)).toEqual(['series']);
        expect(changes.fields.changed).toEqual([
            {
                before: {
                    name: 'value',
                    label: 'Value',
                    type: 'metric',
                    required: true,
                },
                after: {
                    name: 'value',
                    label: 'Value',
                    type: 'metric',
                    required: false,
                },
            },
        ]);
        expect(summarizeDataAppVizSchemaChanges(changes)).toEqual([
            '+1 field',
            '−1 field',
            '~1 field',
        ]);
    });

    it('treats a changed default, choice set or bound as an option change', () => {
        const changes = diffDataAppVizSchema(base, {
            ...base,
            configOptions: [
                {
                    type: 'boolean',
                    name: 'showLegend',
                    label: 'Show legend',
                    default: false,
                },
                {
                    type: 'select',
                    name: 'mode',
                    label: 'Mode',
                    choices: [{ value: 'stacked', label: 'Stacked' }],
                    default: 'stacked',
                },
                {
                    type: 'number',
                    name: 'limit',
                    label: 'Limit',
                    default: 10,
                    min: 1,
                    max: 50,
                },
                {
                    type: 'color',
                    name: 'accent',
                    label: 'Accent',
                    default: '#000',
                },
            ],
        });

        expect(changes.configOptions.added.map((o) => o.name)).toEqual([
            'accent',
        ]);
        expect(changes.configOptions.removed).toEqual([]);
        expect(changes.configOptions.changed.map((c) => c.after.name)).toEqual([
            'showLegend',
            'mode',
            'limit',
        ]);
        expect(summarizeDataAppVizSchemaChanges(changes)).toEqual([
            '+1 option',
            '~3 options',
        ]);
    });

    it('ignores an option that only moved to another tab group', () => {
        const changes = diffDataAppVizSchema(
            {
                ...base,
                configOptions: [{ ...base.configOptions[0], group: undefined }],
            },
            {
                ...base,
                configOptions: [{ ...base.configOptions[0], group: 'Style' }],
            },
        );

        expect(changes.configOptions.changed).toEqual([]);
    });

    it('reports palette additions and removals', () => {
        const withPalette = { ...base, colorPalette: { group: 'Style' } };

        expect(diffDataAppVizSchema(base, withPalette).colorPalette).toBe(
            'added',
        );
        expect(diffDataAppVizSchema(withPalette, base).colorPalette).toBe(
            'removed',
        );
        expect(
            summarizeDataAppVizSchemaChanges(
                diffDataAppVizSchema(base, withPalette),
            ),
        ).toEqual(['palette added']);
        expect(
            hasDataAppVizSchemaChanges(diffDataAppVizSchema(withPalette, base)),
        ).toBe(true);
    });
});

it('compares gradient defaults structurally after persistence', () => {
    const schema: DataAppVizSchema = {
        ...base,
        configOptions: [
            {
                type: 'gradient',
                name: 'scale',
                label: 'Scale',
                default: {
                    colors: ['#000000', '#ffffff'],
                    min: 'auto',
                    max: 100,
                },
            },
        ],
    };
    expect(
        hasDataAppVizSchemaChanges(
            diffDataAppVizSchema(schema, JSON.parse(JSON.stringify(schema))),
        ),
    ).toBe(false);
    for (const defaultValue of [
        { colors: ['#ffffff', '#000000'], min: 'auto' as const, max: 100 },
        { colors: ['#000000', '#ffffff'], min: 0, max: 100 },
        { colors: ['#000000', '#ffffff'], min: 'auto' as const, max: 200 },
    ]) {
        const updated: DataAppVizSchema = {
            ...schema,
            configOptions: [
                {
                    type: 'gradient',
                    name: 'scale',
                    label: 'Scale',
                    default: defaultValue,
                },
            ],
        };
        expect(
            diffDataAppVizSchema(schema, updated).configOptions.changed,
        ).toHaveLength(1);
    }
});

it('treats omitted gradient bounds visibility as true and detects visibility changes', () => {
    const declaration = {
        type: 'gradient' as const,
        name: 'scale',
        label: 'Scale',
        default: {
            colors: ['#000', '#fff'],
            min: 'auto' as const,
            max: 'auto' as const,
        },
    };
    const before = { ...base, configOptions: [declaration] };
    const visible = {
        ...base,
        configOptions: [{ ...declaration, showBounds: true }],
    };
    const hidden = {
        ...base,
        configOptions: [{ ...declaration, showBounds: false }],
    };
    expect(
        hasDataAppVizSchemaChanges(diffDataAppVizSchema(before, visible)),
    ).toBe(false);
    expect(diffDataAppVizSchema(before, hidden).configOptions.changed).toEqual([
        { before: declaration, after: hidden.configOptions[0] },
    ]);
});
