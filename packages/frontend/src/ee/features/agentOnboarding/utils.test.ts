import { describe, expect, it } from 'vitest';
import {
    describeAgentOnboardingEvent,
    summarizeAgentOnboardingEvents,
    toSemanticLayerModel,
} from './utils';

const event = (message: string) => ({
    eventType: 'step' as const,
    stage: null,
    message,
    createdAt: '2026-11-03T10:00:00Z',
});

describe('describeAgentOnboardingEvent', () => {
    it.each([
        [
            'lightdash warehouse-catalog --database postgres --schema jaffle --table orders --include-fields --json',
            'Read the orders table',
        ],
        [
            'lightdash warehouse-catalog --database postgres --schema jaffle --json',
            'Listed the tables in jaffle',
        ],
        ['Write: lightdash/models/orders.yml', 'Wrote the orders model'],
        ['Write: tmp/revenue-by-month.yml', 'Drafted a chart for a question'],
        [
            'lightdash run-chart -p tmp/revenue-by-month.yml',
            'Checked a question returns data',
        ],
        [
            'Write: lightdash-starter-questions.yml',
            'Wrote the starter questions',
        ],
        ['lightdash deploy --project abc', 'Deployed the semantic layer'],
    ])('describes %s', (message, expected) => {
        expect(describeAgentOnboardingEvent(message)).toBe(expected);
    });

    it('hides housekeeping', () => {
        expect(describeAgentOnboardingEvent('Glob: **/*.md')).toBeNull();
        expect(
            describeAgentOnboardingEvent('Edit: LIGHTDASH_HANDOFF.md'),
        ).toBeNull();
    });
});

describe('summarizeAgentOnboardingEvents', () => {
    it('counts distinct tables and models', () => {
        expect(
            summarizeAgentOnboardingEvents([
                event(
                    'lightdash warehouse-catalog --schema s --table a --json',
                ),
                event(
                    'lightdash warehouse-catalog --schema s --table a --json',
                ),
                event(
                    'lightdash warehouse-catalog --schema s --table b --json',
                ),
                event('Write: lightdash/models/a.yml'),
            ]),
        ).toEqual({ tables: 2, models: 1 });
    });
});

describe('toSemanticLayerModel', () => {
    it('reads list dimensions and keyed metrics, skipping hidden fields', () => {
        const model = toSemanticLayerModel('lightdash/models/orders.yml', {
            name: 'orders',
            sql_from: '"jaffle"."orders"',
            dimensions: [
                { name: 'order_id', hidden: true, type: 'number' },
                { name: 'order_date', label: 'Order date', type: 'date' },
            ],
            metrics: { total_order_value: { type: 'sum' } },
        });
        expect(model).toEqual({
            name: 'orders',
            label: 'Orders',
            dimensions: [
                {
                    name: 'order_date',
                    label: 'Order date',
                    type: 'date',
                    description: null,
                },
            ],
            metrics: [
                {
                    name: 'total_order_value',
                    label: 'Total order value',
                    type: 'sum',
                    description: null,
                },
            ],
        });
    });

    it('returns null for content that is not a model yet', () => {
        expect(toSemanticLayerModel('models/x.yml', 'partial')).toBeNull();
    });
});
