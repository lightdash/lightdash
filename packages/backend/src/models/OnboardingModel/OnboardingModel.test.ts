import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { OnboardingModel } from './OnboardingModel';

describe('OnboardingModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OnboardingModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('creates an onboarding row atomically before selecting it', async () => {
        tracker.on
            .select('organizations')
            .responseOnce([{ organization_id: 7 }]);
        tracker.on.insert('onboarding').responseOnce([]);
        tracker.on.select('onboarding').responseOnce({
            ranQuery_at: null,
            shownSuccess_at: null,
            playground_project_deleted_at: null,
        });

        await expect(
            model.getByOrganizationUuid('organization-uuid'),
        ).resolves.toEqual({
            ranQueryAt: null,
            shownSuccessAt: null,
            playgroundProjectDeletedAt: null,
        });

        expect(tracker.history.insert[0].sql).toContain(
            'on conflict ("organization_id") do nothing',
        );
    });

    it('holds an organization advisory lock around playground provisioning', async () => {
        tracker.on.select('organizations').responseOnce({ organization_id: 7 });
        tracker.on.select('pg_advisory_xact_lock').responseOnce({});
        const callback = vi.fn(async () => 'result');
        const typedCallback = vi.mocked(callback);

        await expect(
            model.runInPlaygroundProvisioningLock(
                'organization-uuid',
                typedCallback,
            ),
        ).resolves.toBe('result');

        const lockQuery = tracker.history.select.find(({ sql }) =>
            sql.includes('pg_advisory_xact_lock'),
        );
        expect(lockQuery?.bindings).toEqual([19350428, 7]);
        expect(typedCallback).toHaveBeenCalledWith(expect.any(Function));
    });
});
