import {
    hashMobileAppLinkKey,
    MobileAppLinkModel,
} from '../../../models/MobileAppLinkModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

const table = 'mobile_app_links';
let migrated: MigratedDatabase;
let model: MobileAppLinkModel;
let organizationUuid: string;
let userUuid: string;
let otherUserUuid: string;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    model = new MobileAppLinkModel({ database: migrated.database });
    const [org] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Mobile app links test' })
        .returning('organization_uuid');
    organizationUuid = org.organization_uuid;
    const [user, otherUser] = await migrated
        .database('users')
        .insert([
            { first_name: 'Link', last_name: 'Owner' },
            { first_name: 'Other', last_name: 'User' },
        ] as never)
        .returning('user_uuid');
    userUuid = user.user_uuid;
    otherUserUuid = otherUser.user_uuid;
});

afterAll(async () => migrated?.destroy());

beforeEach(async () => {
    await migrated.database(table).del();
    await migrated.database('mobile_app_link_rate_counters').del();
});

describe('MobileAppLinkModel', () => {
    it('stores only the hash of the scan id and expires in 30 minutes', async () => {
        const { linkUuid, scanId, expiresAt } = await model.create(
            userUuid,
            organizationUuid,
        );
        const row = await migrated
            .database(table)
            .where('mobile_app_link_uuid', linkUuid)
            .first();

        expect(scanId).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(row?.scan_id_hash).toBe(hashMobileAppLinkKey(scanId));
        expect(JSON.stringify(row)).not.toContain(scanId);
        const minutes = (expiresAt.getTime() - Date.now()) / 60_000;
        expect(minutes).toBeGreaterThan(29);
        expect(minutes).toBeLessThanOrEqual(30);
    });

    it('keeps the first scan time and platform and counts later scans', async () => {
        const { linkUuid, scanId } = await model.create(
            userUuid,
            organizationUuid,
        );

        const first = await model.recordScan(scanId, 'ios');
        const second = await model.recordScan(scanId, 'android');
        const status = await model.findForUser(linkUuid, userUuid);

        expect(first).toEqual(
            expect.objectContaining({
                linkUuid,
                userUuid,
                organizationUuid,
                isFirstScan: true,
            }),
        );
        expect(second?.isFirstScan).toBe(false);
        expect(status?.first_scan_platform).toBe('ios');
        expect(status?.first_scanned_at).toBeInstanceOf(Date);
        expect(status?.scan_count).toBe(2);
    });

    it('ignores expired, unknown and malformed scan ids', async () => {
        const { linkUuid, scanId } = await model.create(
            userUuid,
            organizationUuid,
        );
        await migrated
            .database(table)
            .where('mobile_app_link_uuid', linkUuid)
            .update({
                expires_at: migrated.database.raw(
                    "NOW() - INTERVAL '1 second'",
                ),
            } as never);

        await expect(model.recordScan(scanId, 'ios')).resolves.toBeNull();
        await expect(
            model.recordScan('c'.repeat(43), 'ios'),
        ).resolves.toBeNull();
        await expect(model.recordScan('short', 'ios')).resolves.toBeNull();
    });

    it('finds a link only for the user who created it', async () => {
        const { linkUuid } = await model.create(userUuid, organizationUuid);

        await expect(
            model.findForUser(linkUuid, otherUserUuid),
        ).resolves.toBeNull();
    });

    it('counts requests per key, operation and window', async () => {
        const windowStartedAt = new Date('2026-11-09T12:00:00.000Z');
        const args = { keyHash: 'k', operation: 'scan', windowStartedAt };

        await expect(model.incrementRateCounter(args)).resolves.toBe(1);
        await expect(model.incrementRateCounter(args)).resolves.toBe(2);
        await expect(
            model.incrementRateCounter({ ...args, operation: 'mint' }),
        ).resolves.toBe(1);
    });

    it('deletes links an hour past expiry and old rate windows', async () => {
        const fresh = await model.create(userUuid, organizationUuid);
        const stale = await model.create(userUuid, organizationUuid);
        await migrated
            .database(table)
            .where('mobile_app_link_uuid', stale.linkUuid)
            .update({
                expires_at: migrated.database.raw(
                    "NOW() - INTERVAL '61 minutes'",
                ),
            } as never);
        await model.incrementRateCounter({
            keyHash: 'old',
            operation: 'scan',
            windowStartedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        });
        await model.incrementRateCounter({
            keyHash: 'new',
            operation: 'scan',
            windowStartedAt: new Date(),
        });

        await expect(model.deleteExpired()).resolves.toEqual({
            links: 1,
            rateCounters: 1,
        });
        await expect(
            model.findForUser(fresh.linkUuid, userUuid),
        ).resolves.not.toBeNull();
    });

    it('deletes links when their user is deleted', async () => {
        const [doomed] = await migrated
            .database('users')
            .insert({ first_name: 'Gone', last_name: 'Soon' } as never)
            .returning('user_uuid');
        const { linkUuid } = await model.create(
            doomed.user_uuid,
            organizationUuid,
        );

        await migrated
            .database('users')
            .where('user_uuid', doomed.user_uuid)
            .delete();

        await expect(
            migrated.database(table).where('mobile_app_link_uuid', linkUuid),
        ).resolves.toHaveLength(0);
    });
});
