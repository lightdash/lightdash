import { getDataAppVizPreviewSchema } from './preview';
import { type DataAppVizSchema } from './types';

const schema: DataAppVizSchema = {
    fields: [{ name: 'value', label: 'Value', type: 'column', required: true }],
    configOptions: [
        { name: 'target', label: 'Target', type: 'number', default: 100 },
        {
            name: 'style',
            label: 'Style',
            type: 'select',
            default: 'solid',
            choices: [{ value: 'solid', label: 'Solid' }],
        },
    ],
    colorPalette: null,
};

describe('chart preview validation', () => {
    const validator = getDataAppVizPreviewSchema(schema);

    it('accepts primitive demo values and partial options', () => {
        const preview = {
            rows: [
                { value: 42 },
                { value: 'Ready' },
                { value: null },
                { value: true },
            ],
            optionValues: { target: 80 },
        };
        expect(validator.parse(preview)).toEqual(preview);
    });

    it('accepts options without rows', () => {
        expect(validator.parse({ optionValues: { target: 80 } })).toEqual({
            optionValues: { target: 80 },
        });
    });

    it.each([
        { rows: [] },
        { rows: [{}] },
        { rows: [{ value: 42, typo: 1 }] },
        { rows: [{ value: { nested: true } }] },
        { rows: Array.from({ length: 1001 }, () => ({ value: 1 })) },
        { optionValues: { target: 'bad' } },
        { optionValues: { unknown: true } },
        { optionValues: { style: 'removed' } },
    ])('rejects invalid preview %j', (preview) => {
        expect(validator.safeParse(preview).success).toBe(false);
    });
});

describe('per-field preview options', () => {
    const validator = getDataAppVizPreviewSchema({
        ...schema,
        fields: [
            {
                ...schema.fields[0],
                configOptions: [
                    {
                        name: 'color',
                        label: 'Color',
                        type: 'color',
                        default: '#000000',
                    },
                ],
            },
        ],
    });

    it('accepts settings keyed by sample field id', () => {
        const preview = {
            fieldOptionValues: {
                value: { sample_value: { color: '#abcdef' } },
            },
        };
        expect(validator.parse(preview)).toEqual(preview);
    });

    it('rejects field IDs that the sample context cannot bind', () => {
        expect(
            validator.safeParse({
                fieldOptionValues: {
                    value: { orders_total: { color: '#abcdef' } },
                },
            }).success,
        ).toBe(false);
    });

    it('rejects unknown fields and options', () => {
        expect(
            validator.safeParse({ fieldOptionValues: { missing: {} } }).success,
        ).toBe(false);
        expect(
            validator.safeParse({
                fieldOptionValues: { value: { sample_value: { typo: true } } },
            }).success,
        ).toBe(false);
        expect(
            validator.safeParse({
                fieldOptionValues: { value: { '': { color: '#abcdef' } } },
            }).success,
        ).toBe(false);
    });
});

describe('per-field preview colors', () => {
    const validator = getDataAppVizPreviewSchema({
        ...schema,
        fields: [
            {
                ...schema.fields[0],
                colorOptions: {
                    gradient: {
                        enabled: true,
                        start: '#000000',
                        end: '#ffffff',
                        min: 'auto',
                        max: 'auto',
                    },
                },
            },
        ],
    });

    it('accepts a valid override for the sample field ID', () => {
        expect(
            validator.safeParse({
                fieldColorValues: {
                    value: {
                        sample_value: {
                            gradient: {
                                enabled: true,
                                start: '#ff0000',
                                end: '#00ff00',
                                min: 0,
                                max: 100,
                            },
                        },
                    },
                },
            }).success,
        ).toBe(true);
    });

    it('rejects a stale field ID, unknown slot and invalid hex color', () => {
        expect(
            validator.safeParse({
                fieldColorValues: {
                    value: {
                        stale: {
                            gradient: {
                                enabled: true,
                                start: '#000',
                                end: '#fff',
                                min: 'auto',
                                max: 'auto',
                            },
                        },
                    },
                },
            }).success,
        ).toBe(false);
        expect(
            validator.safeParse({ fieldColorValues: { missing: {} } }).success,
        ).toBe(false);
        expect(
            validator.safeParse({
                fieldColorValues: {
                    value: {
                        sample_value: {
                            gradient: {
                                enabled: true,
                                start: 'red',
                                end: '#fff',
                                min: 'auto',
                                max: 'auto',
                            },
                        },
                    },
                },
            }).success,
        ).toBe(false);
    });
});
