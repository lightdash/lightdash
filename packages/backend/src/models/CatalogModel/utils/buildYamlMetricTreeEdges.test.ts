import { FieldType } from '@lightdash/common';
import { DbCatalog } from '../../../database/entities/catalog';
import { buildYamlMetricTreeEdges, MetricTreeEdge } from './index';

type CatalogRowInput = Pick<
    DbCatalog,
    'field_type' | 'table_name' | 'name' | 'catalog_search_uuid'
>;

const createCatalogRow = (
    overrides: Partial<CatalogRowInput> &
        Pick<CatalogRowInput, 'name' | 'table_name' | 'catalog_search_uuid'>,
): CatalogRowInput => ({
    field_type: FieldType.METRIC,
    ...overrides,
});

describe('buildYamlMetricTreeEdges', () => {
    const projectUuid = 'project-1234';
    const userUuid = 'user-123';

    const catalogRows: CatalogRowInput[] = [
        createCatalogRow({
            name: 'total_order_amount',
            table_name: 'orders',
            catalog_search_uuid: 'orders.total_order_amount',
        }),
        createCatalogRow({
            name: 'unique_order_count',
            table_name: 'orders',
            catalog_search_uuid: 'orders.unique_order_count',
        }),
        createCatalogRow({
            name: 'completed_order_count',
            table_name: 'orders',
            catalog_search_uuid: 'orders.completed_order_count',
        }),
        createCatalogRow({
            name: 'fulfillment_rate',
            table_name: 'orders',
            catalog_search_uuid: 'orders.fulfillment_rate',
        }),
        createCatalogRow({
            name: 'avg_shipping_cost',
            table_name: 'orders',
            catalog_search_uuid: 'orders.avg_shipping_cost',
        }),
        createCatalogRow({
            name: 'completion_percentage',
            table_name: 'orders',
            catalog_search_uuid: 'orders.completion_percentage',
        }),
        createCatalogRow({
            name: 'total_shipping_revenue',
            table_name: 'orders',
            catalog_search_uuid: 'orders.total_shipping_revenue',
        }),
        createCatalogRow({
            name: 'unique_user_count',
            table_name: 'fanouts_users',
            catalog_search_uuid: 'fanouts_users.unique_user_count',
        }),
        createCatalogRow({
            name: 'inflated_user_count',
            table_name: 'fanouts_users',
            catalog_search_uuid: 'fanouts_users.inflated_user_count',
        }),
        // Dimensions (should be ignored when building metric edges)
        createCatalogRow({
            name: 'status',
            table_name: 'orders',
            catalog_search_uuid: 'orders.status',
            field_type: FieldType.DIMENSION,
        }),
        createCatalogRow({
            name: 'order_id',
            table_name: 'orders',
            catalog_search_uuid: 'orders.order_id',
            field_type: FieldType.DIMENSION,
        }),
    ];

    it('should create edges for valid metric relationships', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'unique_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'total_order_amount',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(1);
        expect(result.edges[0]).toEqual({
            source_metric_catalog_search_uuid: 'orders.unique_order_count',
            target_metric_catalog_search_uuid: 'orders.total_order_amount',
            project_uuid: projectUuid,
            created_by_user_uuid: userUuid,
            source: 'yaml',
        });
        expect(result.invalidEdges).toHaveLength(0);
    });

    it('should report self-referencing edges as invalid', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'total_order_amount',
                sourceTableName: 'orders',
                targetMetricName: 'total_order_amount',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(0);
        expect(result.invalidEdges).toHaveLength(1);
        expect(result.invalidEdges[0]).toEqual({
            edge: yamlEdges[0],
            reason: 'self_reference',
        });
    });

    it('should allow same metric name on different tables', () => {
        // Add a metric with same name on different table
        const catalogRowsWithDuplicateNames = [
            ...catalogRows,
            createCatalogRow({
                name: 'total_order_amount',
                table_name: 'customers',
                catalog_search_uuid: 'customers.total-order-amount-uuid',
            }),
        ];

        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'total_order_amount',
                sourceTableName: 'orders',
                targetMetricName: 'total_order_amount',
                targetTableName: 'customers',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows: catalogRowsWithDuplicateNames,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(1);
        expect(result.edges[0]).toEqual({
            source_metric_catalog_search_uuid: 'orders.total_order_amount',
            target_metric_catalog_search_uuid:
                'customers.total-order-amount-uuid',
            project_uuid: projectUuid,
            created_by_user_uuid: userUuid,
            source: 'yaml',
        });
    });

    it('should report invalid edges when source metric not found', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'nonexistent_metric',
                sourceTableName: 'orders',
                targetMetricName: 'total_order_amount',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(0);
        expect(result.invalidEdges).toHaveLength(1);
        expect(result.invalidEdges[0]).toEqual({
            edge: yamlEdges[0],
            reason: 'source_not_found',
        });
    });

    it('should report invalid edges when target metric not found', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'unique_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'nonexistent_metric',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(0);
        expect(result.invalidEdges).toHaveLength(1);
        expect(result.invalidEdges[0]).toEqual({
            edge: yamlEdges[0],
            reason: 'target_not_found',
        });
    });

    it('should report invalid edges when both source and target not found', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'nonexistent_source',
                sourceTableName: 'orders',
                targetMetricName: 'nonexistent_target',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(0);
        expect(result.invalidEdges).toHaveLength(1);
        expect(result.invalidEdges[0]).toEqual({
            edge: yamlEdges[0],
            reason: 'both_not_found',
        });
    });

    it('should return valid edges even when some edges are invalid', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'unique_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'total_order_amount',
                targetTableName: 'orders',
            },
            {
                sourceMetricName: 'nonexistent_metric',
                sourceTableName: 'orders',
                targetMetricName: 'fulfillment_rate',
                targetTableName: 'orders',
            },
            {
                sourceMetricName: 'completed_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'completion_percentage',
                targetTableName: 'orders',
            },
            {
                sourceMetricName: 'avg_shipping_cost',
                sourceTableName: 'orders',
                targetMetricName: 'avg_shipping_cost',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(2);
        expect(result.edges).toEqual([
            expect.objectContaining({
                source_metric_catalog_search_uuid: 'orders.unique_order_count',
                target_metric_catalog_search_uuid: 'orders.total_order_amount',
            }),
            expect.objectContaining({
                source_metric_catalog_search_uuid:
                    'orders.completed_order_count',
                target_metric_catalog_search_uuid:
                    'orders.completion_percentage',
            }),
        ]);

        expect(result.invalidEdges).toHaveLength(2);
        expect(result.invalidEdges).toEqual(
            expect.arrayContaining([
                { edge: yamlEdges[1], reason: 'source_not_found' },
                { edge: yamlEdges[3], reason: 'self_reference' },
            ]),
        );
    });

    it('should deduplicate edges with same source and target', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'completed_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'fulfillment_rate',
                targetTableName: 'orders',
            },
            {
                sourceMetricName: 'completed_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'fulfillment_rate',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(1);
    });

    it('allows circular dependencies between metrics (for now 😁)', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'completed_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'fulfillment_rate',
                targetTableName: 'orders',
            },
            {
                sourceMetricName: 'fulfillment_rate',
                sourceTableName: 'orders',
                targetMetricName: 'completed_order_count',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(2);
        expect(result.invalidEdges).toHaveLength(0);
        expect(result.edges).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    source_metric_catalog_search_uuid:
                        'orders.completed_order_count',
                    target_metric_catalog_search_uuid:
                        'orders.fulfillment_rate',
                }),
                expect.objectContaining({
                    source_metric_catalog_search_uuid:
                        'orders.fulfillment_rate',
                    target_metric_catalog_search_uuid:
                        'orders.completed_order_count',
                }),
            ]),
        );
    });

    it('should handle transitive chains (A → B → C)', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'unique_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'total_order_amount',
                targetTableName: 'orders',
            },
            {
                sourceMetricName: 'total_order_amount',
                sourceTableName: 'orders',
                targetMetricName: 'avg_shipping_cost',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(2);
        expect(result.invalidEdges).toHaveLength(0);
        expect(result.edges).toEqual([
            expect.objectContaining({
                source_metric_catalog_search_uuid: 'orders.unique_order_count',
                target_metric_catalog_search_uuid: 'orders.total_order_amount',
            }),
            expect.objectContaining({
                source_metric_catalog_search_uuid: 'orders.total_order_amount',
                target_metric_catalog_search_uuid: 'orders.avg_shipping_cost',
            }),
        ]);
    });

    it('should handle multiple valid edges forming a metric tree', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'completed_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'completion_percentage',
                targetTableName: 'orders',
            },
            {
                sourceMetricName: 'unique_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'completion_percentage',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(2);
        expect(
            result.edges.map((e) => e.source_metric_catalog_search_uuid),
        ).toEqual(
            expect.arrayContaining([
                'orders.completed_order_count',
                'orders.unique_order_count',
            ]),
        );
    });

    it('should handle cross-table relationships', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'unique_user_count',
                sourceTableName: 'fanouts_users',
                targetMetricName: 'total_order_amount',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(1);
        expect(result.edges[0]).toEqual({
            source_metric_catalog_search_uuid:
                'fanouts_users.unique_user_count',
            target_metric_catalog_search_uuid: 'orders.total_order_amount',
            project_uuid: projectUuid,
            created_by_user_uuid: userUuid,
            source: 'yaml',
        });
    });

    it('should handle null userUuid', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'avg_shipping_cost',
                sourceTableName: 'orders',
                targetMetricName: 'total_shipping_revenue',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid: null,
        });

        expect(result.edges[0].created_by_user_uuid).toBeNull();
    });

    it('should handle undefined userUuid', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'avg_shipping_cost',
                sourceTableName: 'orders',
                targetMetricName: 'total_shipping_revenue',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid: undefined,
        });

        expect(result.edges[0].created_by_user_uuid).toBeNull();
    });

    it('should ignore dimension fields when building uuid map', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'status',
                sourceTableName: 'orders',
                targetMetricName: 'total_order_amount',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(0);
        expect(result.invalidEdges).toHaveLength(1);
        expect(result.invalidEdges[0].reason).toBe('source_not_found');
    });

    it('should return empty arrays when no yaml edges provided', () => {
        const result = buildYamlMetricTreeEdges({
            yamlEdges: [],
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(0);
        expect(result.invalidEdges).toHaveLength(0);
    });

    it('should return empty arrays when no catalog rows provided', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'unique_order_count',
                sourceTableName: 'orders',
                targetMetricName: 'total_order_amount',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows: [],
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(0);
        expect(result.invalidEdges).toHaveLength(1);
        expect(result.invalidEdges[0].reason).toBe('both_not_found');
    });

    it('should report invalid when metric exists but on wrong table', () => {
        const yamlEdges: MetricTreeEdge[] = [
            {
                sourceMetricName: 'unique_user_count', // exists on fanouts_users
                sourceTableName: 'orders', // but referenced on orders
                targetMetricName: 'total_order_amount',
                targetTableName: 'orders',
            },
        ];

        const result = buildYamlMetricTreeEdges({
            yamlEdges,
            catalogRows,
            projectUuid,
            userUuid,
        });

        expect(result.edges).toHaveLength(0);
        expect(result.invalidEdges).toHaveLength(1);
        expect(result.invalidEdges[0].reason).toBe('source_not_found');
    });
});
