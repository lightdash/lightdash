import {
    AuthorizationError,
    FilterOperator,
    MetricType,
    type Account,
    type MetricQuery,
} from '@lightdash/common';
import { type AuditLogEvent } from '../../logging/auditLog';
import {
    auditFieldAttributeAccess,
    auditMetricQueryAttributeAccess,
    auditAndFilterExplore,
    getMetricQueryFieldIds,
} from './userAttributeAudit';
import {
    EXPLORE_FILTERED_WITH_ACCESS_LEVEL_2,
    EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
    EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
    EXPLORE_WITH_TABLE_ANY_ATTRIBUTES,
    EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES,
} from './UserAttributeUtil.mocks';
import { getFilteredExplore } from './UserAttributeUtils';

const account = {
    authentication: { type: 'session', source: 'src' },
    organization: { organizationUuid: 'org-uuid' },
    user: {
        id: 'user-uuid',
        type: 'registered',
        userUuid: 'user-uuid',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'member',
    },
    requestContext: {
        ip: '10.0.0.1',
        userAgent: 'vitest',
        requestId: 'request-uuid',
    },
    isAnonymousUser: () => false,
    isServiceAccount: () => false,
} as unknown as Account;

const emptyMetricQuery: MetricQuery = {
    exploreName: 'payments',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const createLogger = () => vi.fn<(event: AuditLogEvent) => void>();

describe('auditAndFilterExplore', () => {
    test('records a denial attributed to the actor and request when the base table attributes are not satisfied', () => {
        const auditLogger = createLogger();

        expect(() =>
            auditAndFilterExplore({
                account,
                projectUuid: 'project-uuid',
                auditLogger,
                explore: EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES,
                userAttributes: { access_level: ['1'] },
            }),
        ).toThrow(AuthorizationError);

        expect(auditLogger).toHaveBeenCalledTimes(1);
        const event = auditLogger.mock.calls[0][0];
        expect(event).toMatchObject({
            status: 'denied',
            action: 'view',
            actor: { type: 'session', uuid: 'user-uuid' },
            context: { requestId: 'request-uuid', ip: '10.0.0.1' },
            resource: {
                type: 'Explore',
                organizationUuid: 'org-uuid',
                projectUuid: 'project-uuid',
                metadata: {
                    exploreName: 'payments',
                    accessControl: 'user_attributes',
                    requiredAttributes: { access_level: '2' },
                    unsatisfiedAttributes: ['access_level'],
                },
            },
        });
        expect(event.reason).toContain('payments');
    });

    test('records an allowed decision when the restricted base table attributes are satisfied', () => {
        const auditLogger = createLogger();

        const explore = auditAndFilterExplore({
            account,
            projectUuid: 'project-uuid',
            auditLogger,
            explore: EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES,
            userAttributes: { access_level: ['2'] },
        });

        expect(explore).toStrictEqual(
            getFilteredExplore(EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES, {
                access_level: ['2'],
            }),
        );
        expect(auditLogger).toHaveBeenCalledTimes(1);
        expect(auditLogger.mock.calls[0][0]).toMatchObject({
            status: 'allowed',
            resource: { metadata: { unsatisfiedAttributes: [] } },
        });
    });

    test('names every any-attribute when none of them matches', () => {
        const auditLogger = createLogger();

        expect(() =>
            auditAndFilterExplore({
                account,
                projectUuid: 'project-uuid',
                auditLogger,
                explore: EXPLORE_WITH_TABLE_ANY_ATTRIBUTES,
                userAttributes: {},
            }),
        ).toThrow(AuthorizationError);

        expect(auditLogger.mock.calls[0][0].resource.metadata).toMatchObject({
            anyAttributes:
                EXPLORE_WITH_TABLE_ANY_ATTRIBUTES.tables.payments.anyAttributes,
            unsatisfiedAttributes: Object.keys(
                EXPLORE_WITH_TABLE_ANY_ATTRIBUTES.tables.payments
                    .anyAttributes ?? {},
            ),
        });
    });

    test('is silent for explores without attribute restrictions', () => {
        const auditLogger = createLogger();

        auditAndFilterExplore({
            account,
            projectUuid: 'project-uuid',
            auditLogger,
            explore: EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
            userAttributes: {},
        });

        expect(auditLogger).not.toHaveBeenCalled();
    });
});

describe('auditMetricQueryAttributeAccess', () => {
    const filteredExplore = getFilteredExplore(
        EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
        { access_level: ['2'] },
    );

    test('records a denial naming the fields the user attributes hide', () => {
        const auditLogger = createLogger();

        auditMetricQueryAttributeAccess({
            account,
            projectUuid: 'project-uuid',
            auditLogger,
            explore: filteredExplore,
            metricQuery: {
                ...emptyMetricQuery,
                dimensions: ['payments_amount', 'payments_name'],
                metrics: ['orders_average_order_size'],
            },
        });

        expect(auditLogger).toHaveBeenCalledTimes(1);
        const event = auditLogger.mock.calls[0][0];
        expect(event).toMatchObject({
            status: 'denied',
            actor: { uuid: 'user-uuid' },
            context: { requestId: 'request-uuid' },
            resource: {
                type: 'Explore',
                projectUuid: 'project-uuid',
                metadata: {
                    exploreName: 'payments',
                    accessControl: 'user_attributes',
                    deniedFieldIds: [
                        'payments_name',
                        'orders_average_order_size',
                    ],
                },
            },
        });
        expect(event.resource.metadata?.fields).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    fieldId: 'payments_amount',
                    access: 'allowed',
                    tableRequiredAttributes: { access_level: '2' },
                }),
                expect.objectContaining({
                    fieldId: 'payments_name',
                    access: 'denied',
                    requiredAttributes: { access_level: '3' },
                }),
                expect.objectContaining({
                    fieldId: 'orders_average_order_size',
                    access: 'denied',
                    tableRequiredAttributes: { access_level: '1' },
                }),
            ]),
        );
        expect(event.reason).toContain('payments_name');
        expect(event.reason).toContain('orders_average_order_size');
    });

    test('records an allowed decision when every restricted field requested is visible', () => {
        const auditLogger = createLogger();

        auditMetricQueryAttributeAccess({
            account,
            projectUuid: 'project-uuid',
            auditLogger,
            explore: filteredExplore,
            metricQuery: {
                ...emptyMetricQuery,
                dimensions: ['payments_amount'],
                metrics: ['payments_total_revenue'],
            },
        });

        expect(auditLogger).toHaveBeenCalledTimes(1);
        expect(auditLogger.mock.calls[0][0]).toMatchObject({
            status: 'allowed',
            resource: { metadata: { deniedFieldIds: [] } },
        });
    });

    test('is silent when the query only touches unrestricted fields', () => {
        const auditLogger = createLogger();

        auditMetricQueryAttributeAccess({
            account,
            projectUuid: 'project-uuid',
            auditLogger,
            explore: getFilteredExplore(
                EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
                {},
            ),
            metricQuery: {
                ...emptyMetricQuery,
                dimensions: ['payments_amount'],
                metrics: ['payments_total_revenue'],
            },
        });

        expect(auditLogger).not.toHaveBeenCalled();
    });

    test('is silent for an explore that was never attribute-filtered', () => {
        const auditLogger = createLogger();

        auditMetricQueryAttributeAccess({
            account,
            projectUuid: 'project-uuid',
            auditLogger,
            explore: EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
            metricQuery: { ...emptyMetricQuery, dimensions: ['payments_name'] },
        });

        expect(auditLogger).not.toHaveBeenCalled();
    });

    test('treats a hidden filter target as a denied field', () => {
        const auditLogger = createLogger();

        auditFieldAttributeAccess({
            account,
            projectUuid: 'project-uuid',
            auditLogger,
            explore: EXPLORE_FILTERED_WITH_ACCESS_LEVEL_2,
            fieldIds: ['payments_name'],
        });

        expect(auditLogger.mock.calls[0][0]).toMatchObject({
            status: 'denied',
            resource: { metadata: { deniedFieldIds: ['payments_name'] } },
        });
    });
});

describe('getMetricQueryFieldIds', () => {
    test('collects every field a query can reference, without duplicates', () => {
        expect(
            getMetricQueryFieldIds({
                ...emptyMetricQuery,
                dimensions: ['payments_amount'],
                metrics: ['payments_total_revenue'],
                sorts: [{ fieldId: 'payments_amount', descending: true }],
                filters: {
                    dimensions: {
                        id: 'group',
                        and: [
                            {
                                id: 'rule',
                                target: { fieldId: 'payments_name' },
                                operator: FilterOperator.EQUALS,
                                values: ['x'],
                            },
                        ],
                    },
                },
                additionalMetrics: [
                    {
                        name: 'custom',
                        table: 'orders',
                        baseDimensionName: 'amount',
                        sql: '${TABLE}.amount',
                        type: MetricType.SUM,
                    },
                ],
            }),
        ).toStrictEqual([
            'payments_amount',
            'payments_total_revenue',
            'payments_name',
            'orders_amount',
        ]);
    });
});
