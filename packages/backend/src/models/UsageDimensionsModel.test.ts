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

    it('returns an empty snapshot when there are no charts', async () => {
        tracker.on.select('saved_queries').response([]);
        expect(await collect()).toEqual([]);
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
        },
    );

    it('propagates a second timeout instead of retrying indefinitely', async () => {
        tracker.on.select('saved_queries').simulateErrorOnce(timeout);
        tracker.on.select('saved_queries').simulateErrorOnce(timeout);
        tracker.on.select('saved_queries').response([]);
        await expect(collect()).rejects.toMatchObject({ code: '57014' });
    });

    it('does not retry other database errors', async () => {
        tracker.on
            .select('saved_queries')
            .simulateErrorOnce('database unavailable');
        tracker.on.select('saved_queries').response([]);
        await expect(collect()).rejects.toThrow('database unavailable');
    });
});

describe('users snapshot', () => {
    it('includes deactivated members with whether they are active, and leaves out internal users', async () => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const tracker = getTracker();
        tracker.reset();
        tracker.on.any(/^SET /i).response([]);
        tracker.on.any(/^SELECT set_config/i).response([]);
        tracker.on
            .select('organization_memberships')
            .responseOnce([
                {
                    cursor: 1,
                    json: '{"user_id":"left","name":"Dana Whitcombe","is_active":false}',
                },
            ])
            .on.select('organization_memberships')
            .response([]);
        try {
            const lines = [];
            for await (const line of new UsageDimensionsModel(
                database,
                'https://lightdash.example.com',
            ).getJsonLines(
                {
                    organization_id: 1,
                    organization_uuid: '10000000-0000-0000-0000-000000000001',
                },
                'users',
            ))
                lines.push(line);
            expect(lines.join('')).toContain('Dana Whitcombe');
            const [{ sql, bindings }] = tracker.history.select.filter((query) =>
                query.sql.includes('organization_memberships'),
            );
            // A member who has been deactivated is still a member whose past activity needs a name
            expect(sql).not.toMatch(/"u"\."is_active" = /);
            expect(sql).toContain("'is_active', u.is_active");
            expect(sql).toContain('"u"."is_internal" = ');
            expect(bindings).toContain(false);
        } finally {
            tracker.reset();
            await database.destroy();
        }
    });
});
