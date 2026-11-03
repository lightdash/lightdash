import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { DatabaseError } from 'pg';
import { UsageDimensionsModel } from './UsageDimensionsModel';

describe('chart snapshot timeout recovery', () => {
    let database: Knex;
    let tracker: ReturnType<typeof getTracker>;
    const projectUuid = '20000000-0000-0000-0000-000000000001';
    const organization = {
        organization_id: 1,
        organization_uuid: '10000000-0000-0000-0000-000000000001',
    };
    const projectsQuery = /^select "project_uuid" from "projects"/;
    const timeout = new DatabaseError('statement timeout', 0, 'error');
    timeout.code = '57014';
    const collect = async () => {
        const lines = [];
        for await (const line of new UsageDimensionsModel(
            database,
            'https://lightdash.example.com',
        ).getJsonLines(organization, 'charts'))
            lines.push(line);
        return lines;
    };

    beforeEach(() => {
        database = knex({ client: MockClient, dialect: 'pg' });
        tracker = getTracker();
        tracker.reset();
        tracker.on.any(/^SET /i).response([]);
        tracker.on.any(/^SELECT set_config/i).response([]);
        tracker.on.select('saved_sql').response([]);
        tracker.on
            .select(projectsQuery)
            .response([{ project_uuid: projectUuid }]);
    });

    afterEach(async () => {
        tracker.reset();
        await database.destroy();
    });

    it('keeps the normal query without a separate project lookup', async () => {
        tracker.on.select('saved_queries').response([]);
        expect(await collect()).toEqual([]);
        expect(
            tracker.history.select.some(({ sql }) => projectsQuery.test(sql)),
        ).toBe(false);
    });

    it.each([false, true])(
        'retries the failed page without losing cursor progress (later page: %s)',
        async (laterPage) => {
            if (laterPage)
                tracker.on
                    .select('saved_queries')
                    .responseOnce([
                        { cursor: '10', json: '{"chart_id":"first"}' },
                    ]);
            tracker.on.select('saved_queries').simulateErrorOnce(timeout);
            tracker.on
                .select('saved_queries')
                .responseOnce([
                    { cursor: '20', json: '{"chart_id":"second"}' },
                ]);
            tracker.on.select('saved_queries').response([]);
            expect(await collect()).toEqual([
                ...(laterPage ? ['{"chart_id":"first"}\n'] : []),
                '{"chart_id":"second"}\n',
            ]);
            const pages = tracker.history.select.filter(({ sql }) =>
                sql.includes('from "saved_queries"'),
            );
            const retry = pages[laterPage ? 2 : 1];
            expect(retry.bindings).toContainEqual([projectUuid]);
            expect(retry.sql).toContain('ANY(ARRAY');
            expect(retry.bindings).toContain(organization.organization_id);
            if (laterPage) expect(retry.bindings).toContain('10');
            expect(pages.at(-1)?.bindings).toContain('20');
            expect(
                tracker.history.select.filter(({ sql }) =>
                    projectsQuery.test(sql),
                ),
            ).toHaveLength(1);
        },
    );

    it('propagates a second timeout instead of retrying indefinitely', async () => {
        tracker.on.select('saved_queries').simulateError(timeout);
        await expect(collect()).rejects.toMatchObject({ code: '57014' });
        expect(
            tracker.history.select.filter(({ sql }) =>
                sql.includes('from "saved_queries"'),
            ),
        ).toHaveLength(2);
    });

    it('does not retry other database errors', async () => {
        tracker.on
            .select('saved_queries')
            .simulateError('database unavailable');
        await expect(collect()).rejects.toThrow('database unavailable');
        expect(
            tracker.history.select.some(({ sql }) => projectsQuery.test(sql)),
        ).toBe(false);
    });
});
