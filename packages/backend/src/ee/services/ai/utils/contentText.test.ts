import * as JsonPatch from 'fast-json-patch';
import { describe, expect, it } from 'vitest';
import {
    applyTextEdits,
    serializeContent,
    textEditsToPatch,
} from './contentText';

const chart = {
    name: 'Monthly revenue',
    slug: 'monthly-revenue',
    updatedAt: '2026-11-23T00:00:00.000Z',
    contentType: 'chart',
    parameters: undefined,
    chartConfig: {
        type: 'cartesian',
        config: {
            layout: { xField: 'orders_month', yField: ['orders_total'] },
        },
    },
};

describe('contentText', () => {
    it('hides read-only keys from the text the model edits', () => {
        const text = serializeContent(chart);
        expect(text).not.toContain('slug');
        expect(text).not.toContain('updatedAt');
        expect(text).toContain('name: Monthly revenue\n');
    });

    it('turns edits into a patch that refuses a value changed since the read', () => {
        const layout = '    layout:\n';
        const patch = textEditsToPatch(chart, [
            {
                old: 'name: Monthly revenue\n',
                new: 'name: Monthly revenue by status\n',
            },
            { old: layout, new: `${layout}      stack: true\n` },
        ]);
        expect(patch).toEqual([
            {
                op: 'add',
                path: '/chartConfig/config/layout/stack',
                value: true,
            },
            { op: 'test', path: '/name', value: 'Monthly revenue' },
            {
                op: 'replace',
                path: '/name',
                value: 'Monthly revenue by status',
            },
        ]);
        expect(() =>
            JsonPatch.applyPatch(
                structuredClone({ ...chart, name: 'Renamed meanwhile' }),
                patch,
                true,
            ),
        ).toThrow(/Test operation failed/);
    });

    it('applies nothing when any edit misses, and points at the closest lines', () => {
        const text = serializeContent(chart);
        expect(() =>
            applyTextEdits(text, [
                { old: 'name: Monthly revenue', new: 'name: Renamed' },
                {
                    old: 'layout:\n  xField: orders_month',
                    new: 'layout: {}',
                },
            ]),
        ).toThrow(
            /Edit 2 of 2: "old" was not found after the earlier edits[\s\S]*Closest lines:[\s\S]*xField: orders_month/,
        );
    });

    it('refuses an ambiguous match', () => {
        expect(() =>
            applyTextEdits('a: 1\na: 1\n', [{ old: 'a: 1', new: 'a: 2' }]),
        ).toThrow(/matches 2 places/);
    });

    it('refuses edits that break the format or change nothing', () => {
        expect(() =>
            textEditsToPatch(chart, [{ old: 'name: ', new: 'name: [' }]),
        ).toThrow(/not valid/);
        expect(() =>
            textEditsToPatch(chart, [
                { old: 'Monthly revenue', new: 'Monthly revenue' },
            ]),
        ).toThrow(/unchanged/);
    });
});
