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

    it('takes the learner lock, then one of the organization copy slots', async () => {
        tracker.on.select('users').responseOnce({ user_id: 42 });
        tracker.on.select('organizations').responseOnce({ organization_id: 7 });
        tracker.on.select('pg_advisory_xact_lock').responseOnce({});
        // First slot is taken, second is free.
        let tries = 0;
        tracker.on.select('pg_try_advisory_xact_lock').response(() => {
            tries += 1;
            return { rows: [{ acquired: tries > 1 }] };
        });
        const callback = vi.fn(async () => 'copied');

        await expect(
            model.runInTrainingCopyLock(
                {
                    userUuid: 'user-uuid',
                    organizationUuid: 'org-uuid',
                    maxConcurrentPerOrganization: 3,
                },
                callback,
            ),
        ).resolves.toBe('copied');

        const userLock = tracker.history.select.find(({ sql }) =>
            sql.includes('pg_advisory_xact_lock'),
        );
        expect(userLock?.bindings).toEqual([19350430, 42]);
        const slots = tracker.history.select.filter(({ sql }) =>
            sql.includes('pg_try_advisory_xact_lock'),
        );
        expect(slots.map((q) => q.bindings)).toEqual([
            [19350431, 7 * 3 + 0],
            [19350431, 7 * 3 + 1],
        ]);
        expect(callback).toHaveBeenCalledOnce();
    });

    it('refuses with a 429 when every organization copy slot is taken', async () => {
        tracker.on.select('users').responseOnce({ user_id: 42 });
        tracker.on.select('organizations').responseOnce({ organization_id: 7 });
        tracker.on.select('pg_advisory_xact_lock').responseOnce({});
        tracker.on
            .select('pg_try_advisory_xact_lock')
            .response({ rows: [{ acquired: false }] });
        const callback = vi.fn(async () => 'copied');

        await expect(
            model.runInTrainingCopyLock(
                {
                    userUuid: 'user-uuid',
                    organizationUuid: 'org-uuid',
                    maxConcurrentPerOrganization: 2,
                },
                callback,
            ),
        ).rejects.toThrow(
            'Your organization is already making its limit of training copies',
        );
        expect(
            tracker.history.select.filter(({ sql }) =>
                sql.includes('pg_try_advisory_xact_lock'),
            ),
        ).toHaveLength(2);
        expect(callback).not.toHaveBeenCalled();
    });

    it('reads the playground content seed version', async () => {
        tracker.on
            .select(({ sql }) =>
                sql.includes('playground_content_seed_version'),
            )
            .responseOnce({ playground_content_seed_version: 1 });
        tracker.on.select('organizations').response([{ organization_id: 7 }]);
        tracker.on.insert('onboarding').responseOnce([]);
        tracker.on.select('onboarding').responseOnce({
            ranQuery_at: null,
            shownSuccess_at: null,
            playground_project_deleted_at: null,
        });

        await expect(
            model.getPlaygroundContentSeedVersion('organization-uuid'),
        ).resolves.toBe(1);
    });

    it('writes the playground content seed version', async () => {
        tracker.on.select('organizations').response([{ organization_id: 7 }]);
        tracker.on.insert('onboarding').responseOnce([]);
        tracker.on.select('onboarding').responseOnce({
            ranQuery_at: null,
            shownSuccess_at: null,
            playground_project_deleted_at: null,
        });
        tracker.on.update('onboarding').responseOnce([]);

        await model.setPlaygroundContentSeedVersion('organization-uuid', 1);

        expect(tracker.history.update[0]?.bindings).toContain(1);
    });
});
