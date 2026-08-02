import {
    dataAppVizGenerationSchema,
    dataAppVizJsonSchema,
    dataAppVizSchema,
    getEffectiveOptionValues,
    getVisibleDataAppClaudeModels,
    resolveDefaultVisibleDataAppClaudeModel,
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
} from './types';

const validFields = {
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
};

describe('dataAppVizSchema', () => {
    it('accepts a well-formed fields declaration (configOptions defaults to [], colorPalette to null)', () => {
        const r = dataAppVizSchema.safeParse(validFields);
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.configOptions).toEqual([]);
            expect(r.data.colorPalette).toBeNull();
        }
    });

    it('accepts an empty field list', () => {
        expect(dataAppVizSchema.safeParse({ fields: [] }).success).toBe(true);
    });

    it('rejects non-object / nullish values', () => {
        expect(dataAppVizSchema.safeParse(null).success).toBe(false);
        expect(dataAppVizSchema.safeParse(undefined).success).toBe(false);
        expect(dataAppVizSchema.safeParse('fields').success).toBe(false);
    });

    it('rejects a missing or non-array fields property', () => {
        expect(dataAppVizSchema.safeParse({}).success).toBe(false);
        expect(dataAppVizSchema.safeParse({ fields: {} }).success).toBe(false);
    });

    it('rejects a field with a type outside the vocabulary', () => {
        expect(
            dataAppVizSchema.safeParse({
                fields: [
                    { name: 'x', label: 'X', type: 'pivot', required: true },
                ],
            }).success,
        ).toBe(false);
    });

    it('rejects a field missing required properties or with an empty name', () => {
        expect(
            dataAppVizSchema.safeParse({
                fields: [{ name: 'x', type: 'dimension' }],
            }).success,
        ).toBe(false);
        expect(
            dataAppVizSchema.safeParse({
                fields: [
                    {
                        name: '',
                        label: 'Empty',
                        type: 'metric',
                        required: true,
                    },
                ],
            }).success,
        ).toBe(false);
    });

    it('rejects duplicate field names (mapping is keyed by name)', () => {
        expect(
            dataAppVizSchema.safeParse({
                fields: [
                    { name: 'v', label: 'A', type: 'metric', required: true },
                    { name: 'v', label: 'B', type: 'metric', required: false },
                ],
            }).success,
        ).toBe(false);
    });

    it('accepts each config option type', () => {
        const r = dataAppVizSchema.safeParse({
            fields: [],
            configOptions: [
                {
                    name: 'showLegend',
                    label: 'Legend',
                    type: 'boolean',
                    default: true,
                },
                {
                    name: 'orient',
                    label: 'Orientation',
                    type: 'select',
                    default: 'h',
                    choices: [
                        { value: 'h', label: 'Horizontal' },
                        { value: 'v', label: 'Vertical' },
                    ],
                },
                {
                    name: 'pad',
                    label: 'Padding',
                    type: 'number',
                    default: 8,
                    min: 0,
                },
                { name: 'title', label: 'Title', type: 'text', default: '' },
                {
                    name: 'accent',
                    label: 'Accent',
                    type: 'color',
                    default: '#7262ff',
                },
            ],
        });
        expect(r.success).toBe(true);
    });

    it('rejects an option whose type is outside the declared vocabulary', () => {
        expect(
            dataAppVizSchema.safeParse({
                fields: [],
                configOptions: [
                    {
                        name: 'series',
                        label: 'Series colours',
                        type: 'palette',
                        default: ['#111', '#222'],
                    },
                ],
            }).success,
        ).toBe(false);
    });

    it('accepts a colorPalette declaration, with or without a group', () => {
        const grouped = dataAppVizSchema.safeParse({
            fields: [],
            colorPalette: { group: 'Colours' },
        });
        expect(grouped.success).toBe(true);
        if (grouped.success) {
            expect(grouped.data.colorPalette).toEqual({ group: 'Colours' });
        }

        const ungrouped = dataAppVizSchema.safeParse({
            fields: [],
            colorPalette: {},
        });
        expect(ungrouped.success).toBe(true);
        if (ungrouped.success) expect(ungrouped.data.colorPalette).toEqual({});
    });

    it('rejects a boolean option with a non-boolean default', () => {
        expect(
            dataAppVizSchema.safeParse({
                fields: [],
                configOptions: [
                    { name: 'x', label: 'X', type: 'boolean', default: 'nope' },
                ],
            }).success,
        ).toBe(false);
    });

    it('rejects a select option with no choices', () => {
        expect(
            dataAppVizSchema.safeParse({
                fields: [],
                configOptions: [
                    {
                        name: 'x',
                        label: 'X',
                        type: 'select',
                        default: 'a',
                        choices: [],
                    },
                ],
            }).success,
        ).toBe(false);
    });

    it('rejects duplicate option names', () => {
        expect(
            dataAppVizSchema.safeParse({
                fields: [],
                configOptions: [
                    { name: 'x', label: 'X', type: 'boolean', default: true },
                    { name: 'x', label: 'X2', type: 'text', default: '' },
                ],
            }).success,
        ).toBe(false);
    });
});

describe('getEffectiveOptionValues', () => {
    const opts: DataAppVizConfigOption[] = [
        { name: 'a', label: 'A', type: 'boolean', default: true },
        { name: 'b', label: 'B', type: 'number', default: 8, min: 0 },
    ];

    it('falls back to each option default when unset, keeps set values', () => {
        expect(getEffectiveOptionValues(opts, { b: 12 })).toEqual({
            a: true,
            b: 12,
        });
    });

    it('ignores stale values for options that no longer exist', () => {
        expect(
            getEffectiveOptionValues(
                [{ name: 'a', label: 'A', type: 'boolean', default: false }],
                { gone: 5, a: true },
            ),
        ).toEqual({ a: true });
    });

    it('ignores a stored value whose shape no longer matches the declared type', () => {
        const declared: DataAppVizConfigOption[] = [
            {
                name: 'showLegend',
                label: 'Show legend',
                type: 'boolean',
                default: true,
            },
            { name: 'maxBars', label: 'Max bars', type: 'number', default: 10 },
            { name: 'title', label: 'Title', type: 'text', default: 'Sales' },
            {
                name: 'barColor',
                label: 'Bar colour',
                type: 'color',
                default: '#7162FF',
            },
            {
                name: 'layout',
                label: 'Layout',
                type: 'select',
                choices: [
                    { value: 'vertical', label: 'Vertical' },
                    { value: 'horizontal', label: 'Horizontal' },
                ],
                default: 'vertical',
            },
        ];

        // Each stored value was written under the same name by a declaration
        // that gave the option a different type.
        expect(
            getEffectiveOptionValues(declared, {
                showLegend: 'yes',
                maxBars: '24',
                title: 12,
                // Stored values are untyped JSONB, so a shape the value type no
                // longer allows can still be sitting in the column.
                barColor: ['#7162FF'] as unknown as DataAppVizOptionValue,
                layout: 24,
            }),
        ).toEqual({
            showLegend: true,
            maxBars: 10,
            title: 'Sales',
            barColor: '#7162FF',
            layout: 'vertical',
        });
    });

    it('ignores a stored select value that is no longer a declared choice', () => {
        const declared: DataAppVizConfigOption[] = [
            {
                name: 'layout',
                label: 'Layout',
                type: 'select',
                choices: [{ value: 'vertical', label: 'Vertical' }],
                default: 'vertical',
            },
        ];

        expect(
            getEffectiveOptionValues(declared, { layout: 'horizontal' }),
        ).toEqual({ layout: 'vertical' });
    });
});

describe('getVisibleDataAppClaudeModels', () => {
    it('shows all models when visibility is null/undefined', () => {
        expect(getVisibleDataAppClaudeModels(null)).toEqual([
            'opus',
            'sonnet',
            'haiku',
        ]);
        expect(getVisibleDataAppClaudeModels(undefined)).toEqual([
            'opus',
            'sonnet',
            'haiku',
        ]);
    });

    it('hides only models explicitly set to false', () => {
        expect(getVisibleDataAppClaudeModels({ opus: false })).toEqual([
            'sonnet',
            'haiku',
        ]);
    });

    it('treats an explicit true the same as absent', () => {
        expect(
            getVisibleDataAppClaudeModels({ opus: true, sonnet: false }),
        ).toEqual(['opus', 'haiku']);
    });
});

describe('resolveDefaultVisibleDataAppClaudeModel', () => {
    it('prefers the system default (sonnet) when visible', () => {
        expect(resolveDefaultVisibleDataAppClaudeModel(null)).toBe('sonnet');
    });

    // Hiding Sonnet is the obvious cost-control action; falling back to Opus
    // (the display-order first entry) would make it a cost increase.
    it('falls back to the cheaper model, not the pricier one, when the default is hidden', () => {
        expect(resolveDefaultVisibleDataAppClaudeModel({ sonnet: false })).toBe(
            'haiku',
        );
    });

    it('falls back to opus only when it is the sole visible model', () => {
        expect(
            resolveDefaultVisibleDataAppClaudeModel({
                sonnet: false,
                haiku: false,
            }),
        ).toBe('opus');
    });

    it('falls back to haiku when only haiku remains visible', () => {
        expect(
            resolveDefaultVisibleDataAppClaudeModel({
                opus: false,
                sonnet: false,
            }),
        ).toBe('haiku');
    });

    it('returns null when every model is hidden', () => {
        expect(
            resolveDefaultVisibleDataAppClaudeModel({
                opus: false,
                sonnet: false,
                haiku: false,
            }),
        ).toBeNull();
    });
});

describe('dataAppVizGenerationSchema', () => {
    it('requires configOptions and colorPalette, unlike the persistence schema', () => {
        expect(dataAppVizGenerationSchema.safeParse(validFields).success).toBe(
            false,
        );
        expect(
            dataAppVizGenerationSchema.safeParse({
                ...validFields,
                configOptions: [],
            }).success,
        ).toBe(false);
        expect(
            dataAppVizGenerationSchema.safeParse({
                ...validFields,
                configOptions: [],
                colorPalette: null,
            }).success,
        ).toBe(true);
    });

    it('accepts the same vocabulary the persistence schema does', () => {
        const declaration = {
            ...validFields,
            configOptions: [
                {
                    name: 'accent',
                    label: 'Accent',
                    type: 'color',
                    default: '#7162FF',
                },
            ],
            colorPalette: { group: 'Colours' },
        };
        expect(dataAppVizGenerationSchema.safeParse(declaration).success).toBe(
            true,
        );
        expect(dataAppVizSchema.safeParse(declaration).success).toBe(true);
    });
});

describe('dataAppVizJsonSchema', () => {
    // What the generator CLI receives via --json-schema.
    const jsonSchema = dataAppVizJsonSchema as {
        required?: string[];
        properties?: Record<string, { description?: string }>;
    };

    it('makes fields, configOptions and colorPalette required', () => {
        expect(jsonSchema.required).toEqual(
            expect.arrayContaining(['fields', 'configOptions', 'colorPalette']),
        );
    });

    it('describes what each top-level property is for', () => {
        expect(jsonSchema.properties?.fields.description).toBeTruthy();
        expect(jsonSchema.properties?.configOptions.description).toBeTruthy();
        expect(jsonSchema.properties?.colorPalette.description).toBeTruthy();
    });
});
