import { describe, expect, it } from 'vitest';
import {
    serializeCustomChartTypeForPrompt,
    serializeCustomChartTypeSchema,
    type CustomChartType,
} from './customChartTypeSerializer';

const cohortWaterfall: CustomChartType = {
    slug: 'cohort-waterfall',
    name: 'Cohort Waterfall',
    description: 'Retention by signup cohort',
    schema: {
        fields: [
            {
                name: 'cohort_period',
                label: 'Cohort period',
                type: 'dimension',
                required: true,
            },
            {
                name: 'revenue',
                label: 'Revenue',
                type: 'metric',
                required: true,
            },
            {
                name: 'segment',
                label: 'Segment',
                type: 'series',
                required: false,
            },
        ],
        configOptions: [
            {
                type: 'boolean',
                name: 'show_labels',
                label: 'Show labels',
                default: true,
            },
            {
                type: 'select',
                name: 'scale',
                label: 'Scale',
                group: 'Axis',
                choices: [
                    { value: 'linear', label: 'Linear' },
                    { value: 'log', label: 'Log' },
                ],
                default: 'linear',
            },
            {
                type: 'number',
                name: 'max_bars',
                label: 'Max bars',
                group: 'Axis',
                default: 10,
                min: 1,
                max: 50,
            },
            {
                type: 'text',
                name: 'subtitle',
                label: 'Subtitle',
                default: '',
            },
            {
                type: 'color',
                name: 'highlight',
                label: 'Highlight color',
                group: 'Style',
                default: '#ff0000',
            },
        ],
        colorPalette: null,
    },
};

const minimal: CustomChartType = {
    slug: 'status-donut',
    name: 'Status Donut',
    description: '',
    schema: {
        fields: [
            {
                name: 'status',
                label: 'Status',
                type: 'dimension',
                required: true,
            },
        ],
        configOptions: [],
        colorPalette: null,
    },
};

describe('serializeCustomChartTypeForPrompt', () => {
    it('serializes name, description, field labels and grouped option labels', () => {
        expect(serializeCustomChartTypeForPrompt(cohortWaterfall)).toBe(
            [
                '<customChartType slug="cohort-waterfall" name="Cohort Waterfall">',
                '<description>Retention by signup cohort</description>',
                '<fields>Cohort period; Revenue; Segment</fields>',
                '<configOptions>Show labels; Axis: Scale; Axis: Max bars; Subtitle; Style: Highlight color</configOptions>',
                '</customChartType>',
            ].join('\n'),
        );
    });

    it('omits empty description and empty configOptions', () => {
        expect(serializeCustomChartTypeForPrompt(minimal)).toBe(
            [
                '<customChartType slug="status-donut" name="Status Donut">',
                '<fields>Status</fields>',
                '</customChartType>',
            ].join('\n'),
        );
    });

    it('escapes XML-significant characters', () => {
        const nasty: CustomChartType = {
            ...minimal,
            name: 'A <b> & "c"',
            description: 'x < y & z',
        };
        const output = serializeCustomChartTypeForPrompt(nasty);
        expect(output).toContain('name="A &lt;b&gt; &amp; &quot;c&quot;"');
        expect(output).toContain('<description>x &lt; y &amp; z</description>');
    });
});

describe('serializeCustomChartTypeSchema', () => {
    it('serializes the full schema with slot names, types, required and option details', () => {
        expect(serializeCustomChartTypeSchema(cohortWaterfall)).toBe(
            [
                'name: Cohort Waterfall',
                'slug: cohort-waterfall',
                'description: Retention by signup cohort',
                'fields:',
                '- cohort_period "Cohort period" (dimension, required)',
                '- revenue "Revenue" (metric, required)',
                '- segment "Segment" (series, optional)',
                'configOptions:',
                '- show_labels "Show labels" [boolean] default: true',
                '- scale "Scale" [select] group: Axis, choices: linear | log, default: linear',
                '- max_bars "Max bars" [number] group: Axis, min: 1, max: 50, default: 10',
                '- subtitle "Subtitle" [text] default: ""',
                '- highlight "Highlight color" [color] group: Style, default: "#ff0000"',
            ].join('\n'),
        );
    });

    it('serializes a schema without options or description', () => {
        expect(serializeCustomChartTypeSchema(minimal)).toBe(
            [
                'name: Status Donut',
                'slug: status-donut',
                'fields:',
                '- status "Status" (dimension, required)',
                'configOptions: none',
            ].join('\n'),
        );
    });
});
