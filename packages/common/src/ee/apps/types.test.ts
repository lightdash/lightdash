import {
    dataAppVizGenerationSchema,
    dataAppVizJsonSchema,
    dataAppVizSchema,
    getEffectiveOptionValues,
    getVisibleDataAppClaudeModels,
    isOfficialChartType,
    pruneDataAppVizOptionValues,
    resolveDefaultDataAppClaudeModel,
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

describe('isOfficialChartType', () => {
    it('is true only when registrySlug is set', () => {
        expect(isOfficialChartType({ registrySlug: 'radial-gauge' })).toBe(
            true,
        );
        expect(isOfficialChartType({ registrySlug: null })).toBe(false);
    });
});

describe.each([
    ['persisted', dataAppVizSchema],
    ['generated', dataAppVizGenerationSchema],
])('%s input guidance', (_name, schema) => {
    const declaration = (description: unknown, inputGuidance?: unknown) => ({
        fields: [{ ...validFields.fields[0], description }],
        configOptions: [],
        colorPalette: null,
        inputGuidance,
    });

    it.each([undefined, null, '', '  \n  '])(
        'treats absent or blank help (%j) as omitted',
        (help) => {
            const parsed = schema.parse(declaration(help, help));
            expect(parsed.fields[0].description).toBeUndefined();
            expect(parsed.inputGuidance).toBeUndefined();
        },
    );

    it('trims multiline help while preserving its meaning', () => {
        const parsed = schema.parse(
            declaration(
                '  Stage label.\nChoose one per row.  ',
                '  One row per stage.\nSort in stage order.  ',
            ),
        );
        expect(parsed.fields[0].description).toBe(
            'Stage label.\nChoose one per row.',
        );
        expect(parsed.inputGuidance).toBe(
            'One row per stage.\nSort in stage order.',
        );
    });
});

describe('dataAppVizGenerationSchema input guidance limits', () => {
    const declaration = (description: unknown, inputGuidance?: unknown) => ({
        fields: [{ ...validFields.fields[0], description }],
        configOptions: [],
        colorPalette: null,
        inputGuidance,
    });

    it('accepts descriptions at 160 characters and rejects longer copy', () => {
        expect(
            dataAppVizGenerationSchema.safeParse(declaration('a'.repeat(160)))
                .success,
        ).toBe(true);
        expect(
            dataAppVizGenerationSchema.safeParse(declaration('a'.repeat(161)))
                .success,
        ).toBe(false);
    });

    it('accepts chart guidance at 200 characters and rejects longer copy', () => {
        expect(
            dataAppVizGenerationSchema.safeParse(
                declaration(undefined, 'a'.repeat(200)),
            ).success,
        ).toBe(true);
        expect(
            dataAppVizGenerationSchema.safeParse(
                declaration(undefined, 'a'.repeat(201)),
            ).success,
        ).toBe(false);
    });

    it('omits legacy examples from generated declarations', () => {
        const withExamples = {
            ...declaration(undefined),
            fields: [{ ...validFields.fields[0], examples: [0, false, null] }],
        };
        expect(
            dataAppVizGenerationSchema.parse(withExamples).fields[0],
        ).not.toHaveProperty('examples');
    });
});

describe('per-field config options', () => {
    const declaration = {
        fields: [
            {
                name: 'values',
                label: 'Values',
                type: 'metric',
                required: true,
                multiple: true,
                configOptions: [
                    {
                        name: 'color',
                        label: 'Color',
                        type: 'color',
                        default: '#112233',
                    },
                    {
                        name: 'enabled',
                        label: 'Enabled',
                        type: 'boolean',
                        default: true,
                    },
                ],
            },
        ],
        configOptions: [],
        colorPalette: null,
    };

    it('accepts per-field controls in read and generation schemas', () => {
        expect(dataAppVizSchema.safeParse(declaration).success).toBe(true);
        expect(dataAppVizGenerationSchema.safeParse(declaration).success).toBe(
            true,
        );
    });

    it('rejects duplicate option names within one field', () => {
        const invalid = {
            ...declaration,
            fields: [
                {
                    ...declaration.fields[0],
                    configOptions: [
                        declaration.fields[0].configOptions[0],
                        {
                            ...declaration.fields[0].configOptions[0],
                            default: '#445566',
                        },
                    ],
                },
            ],
        };
        expect(dataAppVizSchema.safeParse(invalid).success).toBe(false);
        expect(dataAppVizGenerationSchema.safeParse(invalid).success).toBe(
            false,
        );
    });
});

describe('dataAppVizSchema', () => {
    it('keeps omitted multiple scalar and accepts explicit multi fields', () => {
        expect(
            dataAppVizSchema.parse({
                ...validFields,
                configOptions: [],
                colorPalette: null,
            }).fields[0]?.multiple,
        ).toBeUndefined();
        expect(
            dataAppVizGenerationSchema.parse({
                ...validFields,
                fields: [{ ...validFields.fields[0], multiple: true }],
                configOptions: [],
                colorPalette: null,
            }).fields[0]?.multiple,
        ).toBe(true);
    });

    it('accepts the null emitted for optional multiple by OpenAI strict JSON', () => {
        const declaration = {
            ...validFields,
            fields: [{ ...validFields.fields[0], multiple: null }],
            configOptions: [],
            colorPalette: null,
        };
        expect(dataAppVizGenerationSchema.parse(declaration).fields[0]).toEqual(
            validFields.fields[0],
        );
        expect(JSON.stringify(dataAppVizJsonSchema)).toContain('multiple');
    });

    it('keeps previously saved long guidance readable while generation rejects it', () => {
        const savedSchema = {
            fields: [
                {
                    ...validFields.fields[0],
                    description: 'Stage label. '.repeat(12),
                    examples: [
                        'A long existing example '.repeat(3),
                        0,
                        false,
                        null,
                    ],
                },
            ],
            inputGuidance: 'One row per stage. '.repeat(16),
            configOptions: [],
            colorPalette: null,
        };

        expect(dataAppVizSchema.parse(savedSchema)).toMatchObject({
            ...savedSchema,
            fields: [
                {
                    ...savedSchema.fields[0],
                    description: savedSchema.fields[0].description.trim(),
                },
            ],
            inputGuidance: savedSchema.inputGuidance.trim(),
        });
        expect(dataAppVizGenerationSchema.safeParse(savedSchema).success).toBe(
            false,
        );
    });

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

    it('persists optional field help while keeping legacy declarations valid', () => {
        const parsed = dataAppVizSchema.parse({
            fields: [
                {
                    name: 'stage',
                    label: 'Stage',
                    type: 'dimension',
                    required: true,
                    description: 'The label for each stage.',
                    examples: [0, false, null],
                },
            ],
            inputGuidance:
                'Use one row per stage in order; reshape the query when it returns a different row shape.',
        });

        expect(parsed.fields[0]).toMatchObject({
            description: 'The label for each stage.',
            examples: [0, false, null],
        });
        expect(parsed.inputGuidance).toContain('one row per stage');
        const legacy = dataAppVizSchema.parse(validFields);
        expect(legacy).not.toHaveProperty('inputGuidance');
        expect(legacy.fields[0]).not.toHaveProperty('description');
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

describe('resolveDefaultDataAppClaudeModel', () => {
    it('selects from an already-resolved model list', () => {
        expect(resolveDefaultDataAppClaudeModel(['opus', 'haiku'])).toBe(
            'haiku',
        );
    });

    it('returns null when the resolved model list is empty', () => {
        expect(resolveDefaultDataAppClaudeModel([])).toBeNull();
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

    it('normalizes nullable placeholders for optional properties', () => {
        expect(
            dataAppVizGenerationSchema.safeParse({
                ...validFields,
                configOptions: [
                    {
                        name: 'barWidth',
                        label: 'Bar width',
                        group: null,
                        type: 'number',
                        default: 24,
                        min: null,
                        max: null,
                    },
                ],
                colorPalette: { group: null },
                inputGuidance: null,
                fields: validFields.fields.map((field) => ({
                    ...field,
                    description: null,
                    examples: null,
                })),
            }),
        ).toEqual({
            success: true,
            data: {
                fields: validFields.fields,
                configOptions: [
                    {
                        name: 'barWidth',
                        label: 'Bar width',
                        type: 'number',
                        default: 24,
                    },
                ],
                colorPalette: {},
            },
        });
    });
});

describe('dataAppVizJsonSchema', () => {
    // What the generator CLI receives via --json-schema.
    const jsonSchema = dataAppVizJsonSchema as {
        $schema?: string;
        required?: string[];
        properties?: Record<string, { description?: string }>;
    };

    it('uses the JSON Schema draft supported by both generator CLIs', () => {
        expect(jsonSchema.$schema).toBe(
            'http://json-schema.org/draft-07/schema#',
        );
    });

    it('tells the coding agent the same description and guidance limits without examples', () => {
        expect(dataAppVizJsonSchema).toMatchObject({
            properties: {
                fields: {
                    items: {
                        properties: {
                            description: {
                                anyOf: expect.arrayContaining([
                                    expect.objectContaining({ maxLength: 160 }),
                                ]),
                            },
                        },
                    },
                },
                inputGuidance: {
                    anyOf: expect.arrayContaining([
                        expect.objectContaining({ maxLength: 200 }),
                    ]),
                },
            },
        });
        const fieldProperties = (
            dataAppVizJsonSchema as {
                properties: {
                    fields: { items: { properties: Record<string, unknown> } };
                };
            }
        ).properties.fields.items.properties;
        expect(fieldProperties).not.toHaveProperty('examples');
    });

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

    it('uses strict object schemas compatible with Codex structured output', () => {
        const findMissingRequiredProperties = (
            value: unknown,
            path = '$',
        ): string[] => {
            if (value === null || typeof value !== 'object') {
                return [];
            }

            const schema = value as Record<string, unknown>;
            const missing: string[] = [];
            if (
                schema.properties !== null &&
                typeof schema.properties === 'object'
            ) {
                const propertyNames = Object.keys(schema.properties);
                const required = Array.isArray(schema.required)
                    ? schema.required
                    : [];
                const missingAtPath = propertyNames.filter(
                    (property) => !required.includes(property),
                );
                if (missingAtPath.length > 0) {
                    missing.push(`${path}: ${missingAtPath.join(', ')}`);
                }
            }

            return Object.entries(schema).reduce<string[]>(
                (errors, [key, child]) => [
                    ...errors,
                    ...findMissingRequiredProperties(child, `${path}.${key}`),
                ],
                missing,
            );
        };

        expect(findMissingRequiredProperties(jsonSchema)).toEqual([]);
    });

    it('does not use local JSON Schema references', () => {
        const findReferences = (value: unknown): string[] => {
            if (value === null || typeof value !== 'object') {
                return [];
            }

            const schema = value as Record<string, unknown>;
            return [
                ...(typeof schema.$ref === 'string' ? [schema.$ref] : []),
                ...Object.values(schema).flatMap(findReferences),
            ];
        };

        expect(findReferences(jsonSchema)).toEqual([]);
    });
});

describe('pruneDataAppVizOptionValues', () => {
    const options: DataAppVizConfigOption[] = [
        { type: 'boolean', name: 'showLegend', label: 'Legend', default: true },
        {
            type: 'select',
            name: 'mode',
            label: 'Mode',
            choices: [{ value: 'stacked', label: 'Stacked' }],
            default: 'stacked',
        },
        { type: 'number', name: 'limit', label: 'Limit', default: 10 },
    ];

    it('keeps stored values that still fit and drops the rest', () => {
        expect(
            pruneDataAppVizOptionValues(options, {
                showLegend: false,
                mode: 'grouped',
                limit: 'ten',
                gone: true,
            }),
        ).toEqual({ showLegend: false });
    });

    it('never seeds defaults', () => {
        expect(pruneDataAppVizOptionValues(options, {})).toEqual({});
    });
});
