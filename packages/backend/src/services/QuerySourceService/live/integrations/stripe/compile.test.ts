import {
    ApiConnectorType,
    FilterOperator,
    type MetricQuery,
} from '@lightdash/common';
import { stripeIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import {
    buildLiveExplore,
    type LiveExploreDefinition,
} from '../../explores/definition';
import {
    STRIPE_BALANCE_TRANSACTIONS_EXPLORE,
    STRIPE_CHARGES_EXPLORE,
    STRIPE_SUBSCRIPTIONS_EXPLORE,
} from './model';
import { withStripeRowLimit } from './run';

const NOW = new Date('2026-11-25T12:00:00Z');

const buildExplore = (definition: LiveExploreDefinition) =>
    buildLiveExplore({
        definition,
        exploreName: `stripe_${definition.name}`,
        label: definition.label,
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.STRIPE,
        baseVersion: 1,
        capabilities: stripeIntegration.query.capabilities,
        warehouseSqlBuilder: stripeIntegration.query.warehouseSqlBuilder!,
    });

const compile = (
    definition: LiveExploreDefinition,
    overrides: Partial<MetricQuery>,
) => {
    const exploreName = `stripe_${definition.name}`;
    return compileLiveMetricQuery({
        explore: buildExplore(definition),
        metricQuery: {
            exploreName,
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 100,
            tableCalculations: [],
            ...overrides,
        },
        timezone: 'UTC',
        now: NOW,
    });
};

// The default date range reads the clock
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('Stripe semantic layer', () => {
    test('keeps its field ids stable', () => {
        expect(
            stripeIntegration.model.explores.map((definition) => ({
                explore: definition.name,
                fields: Object.keys(
                    buildExplore(definition).apiSource?.fields ?? {},
                ),
            })),
        ).toMatchSnapshot();
    });
});

describe('compile Stripe queries', () => {
    test('compiles gross volume by month and currency, reading the last 90 days by default', () => {
        const { query, fieldIdsByColumn } = compile(STRIPE_CHARGES_EXPLORE, {
            dimensions: ['stripe_charges_month', 'stripe_charges_currency'],
            metrics: ['stripe_charges_amount'],
            filters: {
                dimensions: {
                    id: 'filters',
                    and: [
                        {
                            id: 'succeeded',
                            target: { fieldId: 'stripe_charges_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['succeeded'],
                        },
                    ],
                },
            },
            sorts: [{ fieldId: 'stripe_charges_month', descending: false }],
        });
        expect(query).toMatchSnapshot();
        expect(query).toContain('FROM "charges"');
        expect(query).toContain("date_trunc('month'");
        expect(query).toMatch(/ORDER BY c0 ASC$/);
        expect(fieldIdsByColumn).toEqual({
            c0: 'stripe_charges_month',
            c1: 'stripe_charges_currency',
            c2: 'stripe_charges_amount',
        });
    });

    test('converts amounts to the main unit, whole for zero-decimal currencies', () => {
        const { query } = compile(STRIPE_BALANCE_TRANSACTIONS_EXPLORE, {
            dimensions: ['stripe_balance_transactions_payout_id'],
            metrics: ['stripe_balance_transactions_net'],
        });
        expect(query).toContain('automatic_transfer_id');
        expect(query).toContain("IN ('bif', 'clp'");
        expect(query).toContain('ELSE 100 END');
    });

    test('reads current subscriptions without a date range', () => {
        const { query } = compile(STRIPE_SUBSCRIPTIONS_EXPLORE, {
            dimensions: ['stripe_subscriptions_status'],
            metrics: ['stripe_subscriptions_subscription_count'],
        });
        expect(query).toContain('FROM "subscriptions"');
        expect(query).not.toContain('WHERE');
    });
});

describe('withStripeRowLimit', () => {
    test('appends a limit, keeping the order of the outer query', () => {
        expect(withStripeRowLimit('SELECT 1 ORDER BY 1', 101)).toBe(
            'SELECT 1 ORDER BY 1\nLIMIT 101',
        );
    });

    test('keeps a smaller limit the query already has', () => {
        expect(withStripeRowLimit('SELECT 1 LIMIT 5', 101)).toBe(
            'SELECT 1\nLIMIT 5',
        );
        expect(withStripeRowLimit('SELECT 1 limit 500', 101)).toBe(
            'SELECT 1\nLIMIT 101',
        );
    });
});
