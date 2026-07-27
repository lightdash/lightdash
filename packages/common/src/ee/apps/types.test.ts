import {
    dataAppVizSchema,
    getEffectiveOptionValues,
    getVisibleDataAppClaudeModels,
    resolveDefaultVisibleDataAppClaudeModel,
    type DataAppVizConfigOption,
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
    it('accepts a well-formed fields declaration (configOptions defaults to [])', () => {
        const r = dataAppVizSchema.safeParse(validFields);
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.configOptions).toEqual([]);
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
                {
                    name: 'palette',
                    label: 'Palette',
                    type: 'palette',
                    default: ['#111', '#222'],
                },
            ],
        });
        expect(r.success).toBe(true);
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

    it('falls back to the next visible model when the default is hidden', () => {
        expect(resolveDefaultVisibleDataAppClaudeModel({ sonnet: false })).toBe(
            'opus',
        );
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
