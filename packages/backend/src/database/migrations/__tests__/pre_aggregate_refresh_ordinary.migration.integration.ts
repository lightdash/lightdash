import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import {
    transactionFixture,
    writeOperations,
} from './preAggregateRefreshTransaction.mock';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
});
afterAll(async () => migrated?.destroy());
afterEach(() => vi.restoreAllMocks());

test.each(writeOperations)(
    'ordinary %s matches main SQL',
    async (operation) => {
        const f = await transactionFixture(migrated.database, operation);
        const methods = [
            vi.spyOn(f.projects, 'saveExploresToCache'),
            vi.spyOn(f.projects, 'saveExploreStreamToCache'),
            vi.spyOn(f.projects, 'saveMultiConnectionExplores'),
            vi.spyOn(f.parameters, 'replace'),
            vi.spyOn(f.projects, 'createVirtualView'),
            vi.spyOn(f.projects, 'updateVirtualView'),
        ];
        const sql: string[] = [];
        const record = (query: { sql: string }) => sql.push(query.sql);
        migrated.database.on('query', record);
        try {
            await f.run();
        } finally {
            migrated.database.off('query', record);
        }
        expect(
            methods.reduce(
                (count, method) => count + method.mock.calls.length,
                0,
            ),
        ).toBe(1);
        methods.forEach((method) =>
            method.mock.calls.forEach((args) =>
                expect(args.some((arg) => typeof arg === 'function')).toBe(
                    false,
                ),
            ),
        );
        expect(sql.length).toBeGreaterThan(3);
        expect(
            sql.some((statement) =>
                statement.includes('hasMalformedPreAggregates'),
            ),
        ).toBe(false);
        if (operation === 'parameters')
            expect(
                sql.some((statement) => statement.includes('cached_explores')),
            ).toBe(false);
        expect(sql).toMatchSnapshot();
    },
);
