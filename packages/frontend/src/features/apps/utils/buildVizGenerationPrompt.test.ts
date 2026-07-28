import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type ItemsMap,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildVizGenerationPrompt,
    getVizPromptColumns,
    stripVizPromptContext,
    type VizPromptColumn,
} from './buildVizGenerationPrompt';

const dimension = (
    name: string,
    type: DimensionType = DimensionType.STRING,
    hidden = false,
): CompiledDimension => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden,
});

const metric = (name: string, hidden = false): CompiledMetric => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden,
});

const itemsMap = (...items: (CompiledDimension | CompiledMetric)[]): ItemsMap =>
    Object.fromEntries(items.map((i) => [`orders_${i.name}`, i])) as ItemsMap;

const column = (
    label: string,
    role: VizPromptColumn['role'],
    dataType: string | null = null,
): VizPromptColumn => ({ id: `orders_${label}`, label, role, dataType });

describe('getVizPromptColumns', () => {
    it('lists dimensions before metrics', () => {
        const columns = getVizPromptColumns(
            itemsMap(metric('count'), dimension('status')),
        );
        expect(columns.map((c) => c.role)).toEqual(['dimension', 'metric']);
    });

    it('carries the warehouse type for dimensions only', () => {
        const columns = getVizPromptColumns(
            itemsMap(
                dimension('ordered_at', DimensionType.TIMESTAMP),
                metric('count'),
            ),
        );
        expect(columns[0].dataType).toBe(DimensionType.TIMESTAMP);
        expect(columns[1].dataType).toBeNull();
    });

    it('omits hidden columns', () => {
        const columns = getVizPromptColumns(
            itemsMap(
                dimension('secret', DimensionType.STRING, true),
                dimension('status'),
            ),
        );
        expect(columns.map((c) => c.label)).toEqual(['Orders status']);
    });
});

describe('buildVizGenerationPrompt', () => {
    it('returns the description alone when there are no columns', () => {
        expect(buildVizGenerationPrompt('  a bar chart  ', [])).toBe(
            'a bar chart',
        );
    });

    it('names every column with its role and type', () => {
        const prompt = buildVizGenerationPrompt('a bar chart', [
            column('Status', 'dimension', 'string'),
            column('Ordered at', 'dimension', 'timestamp'),
            column('Unique order count', 'metric'),
        ]);

        expect(prompt).toContain('a bar chart');
        expect(prompt).toContain('- "Status" — dimension (string)');
        expect(prompt).toContain('- "Ordered at" — dimension (timestamp)');
        expect(prompt).toContain('- "Unique order count" — metric');
    });

    it('asks for a contract that matches those columns', () => {
        const prompt = buildVizGenerationPrompt('a bar chart', [
            column('Status', 'dimension', 'string'),
        ]);
        expect(prompt).toContain(
            'Declare a field contract whose slots match these columns by role and type.',
        );
    });

    it('sends no row values', () => {
        const prompt = buildVizGenerationPrompt('a bar chart', [
            column('Status', 'dimension', 'string'),
        ]);
        expect(prompt).not.toContain('completed');
    });
});

describe('stripVizPromptContext', () => {
    it('recovers what the author typed', () => {
        const prompt = buildVizGenerationPrompt('a donut of orders', [
            column('Status', 'dimension', 'string'),
        ]);
        expect(stripVizPromptContext(prompt)).toBe('a donut of orders');
    });

    it('leaves a prompt that carries no manifest alone', () => {
        expect(stripVizPromptContext('a plain prompt')).toBe('a plain prompt');
    });

    it('handles a multi-line description', () => {
        const prompt = buildVizGenerationPrompt('line one\nline two', [
            column('Status', 'dimension', 'string'),
        ]);
        expect(stripVizPromptContext(prompt)).toBe('line one\nline two');
    });
});
