import {
    DimensionType,
    SEED_PROJECT,
    type WarehouseCatalogTable,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { getTestContext } from '../../vitest.setup.integration';
import { ProjectModel } from './ProjectModel';
import { encryptionUtilMock } from './ProjectModel.mock';

describe('ProjectModel warehouse catalog PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: ProjectModel;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new ProjectModel({
            database: transaction,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: encryptionUtilMock,
        });
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    test('round-trips missing warehouse table arrays through jsonb', async () => {
        const warehouseCatalog = {
            analytics: {
                public: {
                    orders: { order_id: DimensionType.NUMBER },
                },
            },
        };
        const fetchedAt = new Date('2026-09-08T08:00:00.000Z');
        const missingTables: WarehouseCatalogTable[] = [
            {
                database: 'analytics',
                schema: 'public',
                table: 'missing_orders',
            },
        ];

        await model.saveWarehouseToCache(SEED_PROJECT.project_uuid, {
            warehouseCatalog,
            fetchedAt,
            missingTables,
        });
        await expect(
            model.getWarehouseFromCache(SEED_PROJECT.project_uuid),
        ).resolves.toMatchObject({ missingTables });

        await model.saveWarehouseToCache(SEED_PROJECT.project_uuid, {
            warehouseCatalog,
            fetchedAt,
            missingTables: [],
        });
        await expect(
            model.getWarehouseFromCache(SEED_PROJECT.project_uuid),
        ).resolves.toMatchObject({ missingTables: [] });
    });
});
