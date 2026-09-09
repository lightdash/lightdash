import { CatalogType, FieldType } from '@lightdash/common';
import { seedPlaygroundMetricsTrees } from './seedPlaygroundMetricsTrees';

const content = {
    metricsTrees: [
        {
            name: 'Completed orders',
            slug: 'completed-orders',
            description: 'Drivers',
            nodes: [
                {
                    tableName: 'orders',
                    metricName: 'total_completed_order_amount',
                    xPosition: 0,
                    yPosition: 0,
                },
            ],
        },
    ],
};
const setup = () => ({
    getMetricsTrees: vi.fn().mockResolvedValue({ data: [] }),
    getCatalogItemByName: vi.fn().mockResolvedValue({
        catalog_search_uuid: 'target-metric',
        field_type: FieldType.METRIC,
    }),
    createMetricsTree: vi.fn().mockResolvedValue({}),
});

describe('seedPlaygroundMetricsTrees', () => {
    it('resolves the project metric and leaves model edges untouched', async () => {
        const catalogModel = setup();
        await seedPlaygroundMetricsTrees({
            projectUuid: 'target-project',
            userUuid: 'user',
            content,
            catalogModel,
        });
        expect(catalogModel.getCatalogItemByName).toHaveBeenCalledWith(
            'target-project',
            'total_completed_order_amount',
            'orders',
            CatalogType.Field,
        );
        expect(catalogModel.createMetricsTree).toHaveBeenCalledWith(
            expect.objectContaining({
                project_uuid: 'target-project',
                slug: 'completed-orders',
            }),
            [
                {
                    catalogSearchUuid: 'target-metric',
                    xPosition: 0,
                    yPosition: 0,
                },
            ],
            [],
        );
    });
    it.each([undefined, { field_type: FieldType.DIMENSION }])(
        'rejects missing or nonmetric references before creating a tree',
        async (metric) => {
            const catalogModel = setup();
            catalogModel.getCatalogItemByName.mockResolvedValue(metric);
            await expect(
                seedPlaygroundMetricsTrees({
                    projectUuid: 'target-project',
                    userUuid: 'user',
                    content,
                    catalogModel,
                }),
            ).rejects.toThrow('unavailable metric');
            expect(catalogModel.createMetricsTree).not.toHaveBeenCalled();
        },
    );
    it('does not overwrite an existing saved tree on repeated seeding', async () => {
        const catalogModel = setup();
        catalogModel.getMetricsTrees.mockResolvedValue({
            data: [{ slug: 'completed-orders' }],
        });
        await seedPlaygroundMetricsTrees({
            projectUuid: 'target-project',
            userUuid: 'user',
            content,
            catalogModel,
        });
        expect(catalogModel.createMetricsTree).not.toHaveBeenCalled();
        expect(catalogModel.getCatalogItemByName).not.toHaveBeenCalled();
    });
});
