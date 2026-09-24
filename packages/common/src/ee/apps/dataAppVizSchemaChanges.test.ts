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
    it('reports changes to a field rule declaration', () => {
        const rules = [
            {
                enabled: true,
                color: '#ff0000',
                operator: 'eq' as const,
                value: 5,
            },
        ];
        const before: DataAppVizSchema = {
            ...base,
            fields: [
                { ...base.fields[0], colorOptions: { rules } },
                ...base.fields.slice(1),
            ],
        };
        const after: DataAppVizSchema = {
            ...before,
            fields: [
                {
                    ...before.fields[0],
                    colorOptions: {
                        rules: [{ ...rules[0], color: '#00ff00' }],
                    },
                },
                ...before.fields.slice(1),
            ],
        };
        expect(diffDataAppVizSchema(before, after).fields.changed).toHaveLength(
            1,
        );
    });

    it('distinguishes an absent rule capability from an empty declaration', () => {
        const withEmptyRules: DataAppVizSchema = {
            ...base,
            fields: [
                { ...base.fields[0], colorOptions: { rules: [] } },
                ...base.fields.slice(1),
            ],
        };
        expect(
            diffDataAppVizSchema(base, withEmptyRules).fields.changed,
        ).toHaveLength(1);
        expect(
            diffDataAppVizSchema(withEmptyRules, base).fields.changed,
        ).toHaveLength(1);
    });
    it('reports changes to a field gradient declaration', () => {
        const gradient = {
            enabled: true,
            start: '#000000',
            end: '#ffffff',
            min: 'auto' as const,
            max: 'auto' as const,
        };
        const before: DataAppVizSchema = {
            ...base,
            fields: [
                { ...base.fields[0], colorOptions: { gradient } },
                ...base.fields.slice(1),
            ],
        };
        const after: DataAppVizSchema = {
            ...before,
            fields: [
                {
                    ...before.fields[0],
                    colorOptions: { gradient: { ...gradient, end: '#ff0000' } },
                },
                ...before.fields.slice(1),
            ],
        };
        expect(diffDataAppVizSchema(before, after).fields.changed).toHaveLength(
            1,
        );
    });
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

    it('reports changes to a field-specific option', () => {
        const before = {
            ...base,
            fields: base.fields.map((field) =>
                field.name === 'value'
                    ? {
                          ...field,
                          configOptions: [
                              {
                                  type: 'color' as const,
                                  name: 'color',
                                  label: 'Color',
                                  default: '#000000',
                              },
                          ],
                      }
                    : field,
            ),
        };
        const after = {
            ...before,
            fields: before.fields.map((field) =>
                field.name === 'value'
                    ? {
                          ...field,
                          configOptions: [
                              {
                                  type: 'color' as const,
                                  name: 'color',
                                  label: 'Color',
                                  default: '#ffffff',
                              },
                          ],
                      }
                    : field,
            ),
        };
        expect(diffDataAppVizSchema(before, after).fields.changed).toHaveLength(
            1,
        );
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
