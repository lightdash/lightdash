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
