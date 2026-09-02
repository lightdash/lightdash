import { createHash } from 'crypto';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    AiAgentLiveActivitiesTableName,
    AiAgentLiveActivityStartAttemptsTableName,
    MobilePushInstallationsTableName,
} from '../database/entities/mobilePushNotifications';
import { MobilePushNotificationModel } from './MobilePushNotificationModel';

const encryptionUtil = {
    encrypt: (value: string): Buffer => Buffer.from(`encrypted:${value}`),
    decrypt: (value: Buffer): string =>
        value.toString('utf8').replace(/^encrypted:/, ''),
} as unknown as EncryptionUtil;

const fingerprintOf = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

const database = knex({ client: MockClient, dialect: 'pg' });
const model = new MobilePushNotificationModel({
    database: database as unknown as Knex,
    encryptionUtil,
});

let tracker: Tracker;

beforeAll(() => {
    tracker = getTracker();
});

afterEach(() => {
    tracker.reset();
});

describe('MobilePushNotificationModel', () => {
    it('serializes an absent UUID before storing a rotating device token', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).responseOnce([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([]);
        tracker.on.delete(MobilePushInstallationsTableName).responseOnce([]);
        tracker.on.insert(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                installation_uuid: 'installation-uuid',
                organization_uuid: 'organization-uuid',
                user_uuid: 'user-uuid',
                environment: 'sandbox',
            },
        ]);

        await model.upsertInstallation({
            installationUuid: 'installation-uuid',
            organizationUuid: 'organization-uuid',
            userUuid: 'user-uuid',
            platform: 'ios',
            environment: 'sandbox',
            deviceToken: 'device-token',
        });

        const insert = tracker.history.insert.find((query) =>
            query.sql.includes(MobilePushInstallationsTableName),
        );
        expect(insert?.sql).toContain(
            'on conflict ("installation_uuid") do update',
        );
        expect(
            insert?.bindings.some(
                (binding) =>
                    Buffer.isBuffer(binding) &&
                    binding.toString('utf8') === 'encrypted:device-token',
            ),
        ).toBe(true);
        expect(insert?.bindings).not.toContain('device-token');
        expect(insert?.bindings).toEqual(
            expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)]),
        );
        expect(tracker.history.all[0].sql).toContain(
            'pg_advisory_xact_lock(hashtextextended($1, 0))',
        );
        expect(tracker.history.all[0].bindings).toEqual(['installation-uuid']);
    });

    it('clears token capability and attempts before an ownership transfer', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).responseOnce([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                organization_uuid: 'old-organization-uuid',
                user_uuid: 'old-user-uuid',
                environment: 'sandbox',
                device_token_fingerprint: fingerprintOf('new-device-token'),
            },
        ]);
        tracker.on.delete(AiAgentLiveActivitiesTableName).responseOnce([]);
        tracker.on
            .delete(AiAgentLiveActivityStartAttemptsTableName)
            .responseOnce([]);
        tracker.on.delete(MobilePushInstallationsTableName).responseOnce([]);
        tracker.on.insert(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                installation_uuid: 'installation-uuid',
                organization_uuid: 'new-organization-uuid',
                user_uuid: 'new-user-uuid',
                environment: 'production',
            },
        ]);

        await model.upsertInstallation({
            installationUuid: 'installation-uuid',
            organizationUuid: 'new-organization-uuid',
            userUuid: 'new-user-uuid',
            platform: 'ios',
            environment: 'production',
            deviceToken: 'new-device-token',
        });

        const statements = tracker.history.all.map(({ sql }) => sql);
        expect(statements[0]).toContain('pg_advisory_xact_lock');
        expect(statements[1]).toContain('for update');
        expect(statements[2]).toContain(AiAgentLiveActivitiesTableName);
        expect(statements[3]).toContain(
            AiAgentLiveActivityStartAttemptsTableName,
        );
        const insert = tracker.history.insert.find((query) =>
            query.sql.includes(MobilePushInstallationsTableName),
        );
        expect(insert?.sql).toContain('"encrypted_push_to_start_token" = $');
        expect(insert?.sql).toContain('"push_to_start_token_fingerprint" = $');
        expect(insert?.bindings.filter((value) => value === null)).toHaveLength(
            2,
        );
    });

    it('refuses to reassign an installation to a caller with a different device token', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).responseOnce([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                organization_uuid: 'owner-organization-uuid',
                user_uuid: 'owner-user-uuid',
                platform: 'ios',
                environment: 'sandbox',
                device_token_fingerprint: fingerprintOf('owner-device-token'),
            },
        ]);

        await expect(
            model.upsertInstallation({
                installationUuid: 'installation-uuid',
                organizationUuid: 'other-organization-uuid',
                userUuid: 'other-user-uuid',
                platform: 'ios',
                environment: 'sandbox',
                deviceToken: 'guessed-device-token',
            }),
        ).resolves.toEqual({ status: 'owner_mismatch' });

        expect(tracker.history.delete).toHaveLength(0);
        expect(tracker.history.insert).toHaveLength(0);
        expect(tracker.history.update).toHaveLength(0);
    });

    it('reassigns an installation when the caller sends the stored device token', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).responseOnce([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                organization_uuid: 'owner-organization-uuid',
                user_uuid: 'owner-user-uuid',
                platform: 'ios',
                environment: 'sandbox',
                device_token_fingerprint: fingerprintOf('owner-device-token'),
            },
        ]);
        tracker.on.delete(AiAgentLiveActivitiesTableName).responseOnce([]);
        tracker.on
            .delete(AiAgentLiveActivityStartAttemptsTableName)
            .responseOnce([]);
        tracker.on.delete(MobilePushInstallationsTableName).responseOnce([]);
        tracker.on.insert(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                installation_uuid: 'installation-uuid',
                organization_uuid: 'next-organization-uuid',
                user_uuid: 'next-user-uuid',
                platform: 'ios',
                environment: 'sandbox',
            },
        ]);

        await expect(
            model.upsertInstallation({
                installationUuid: 'installation-uuid',
                organizationUuid: 'next-organization-uuid',
                userUuid: 'next-user-uuid',
                platform: 'ios',
                environment: 'sandbox',
                deviceToken: 'owner-device-token',
            }),
        ).resolves.toEqual({
            status: 'stored',
            installation: {
                mobilePushInstallationUuid: 'stored-installation-uuid',
                installationUuid: 'installation-uuid',
                organizationUuid: 'next-organization-uuid',
                userUuid: 'next-user-uuid',
                platform: 'ios',
                environment: 'sandbox',
            },
        });

        expect(
            tracker.history.delete.some((query) =>
                query.sql.includes(AiAgentLiveActivitiesTableName),
            ),
        ).toBe(true);
        expect(
            tracker.history.delete.some((query) =>
                query.sql.includes(AiAgentLiveActivityStartAttemptsTableName),
            ),
        ).toBe(true);
    });

    it('rotates a device token for the same owner', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).responseOnce([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                organization_uuid: 'organization-uuid',
                user_uuid: 'user-uuid',
                platform: 'ios',
                environment: 'sandbox',
                device_token_fingerprint: fingerprintOf('previous-token'),
            },
        ]);
        tracker.on.delete(MobilePushInstallationsTableName).responseOnce([]);
        tracker.on.insert(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                installation_uuid: 'installation-uuid',
                organization_uuid: 'organization-uuid',
                user_uuid: 'user-uuid',
                platform: 'ios',
                environment: 'sandbox',
            },
        ]);

        const result = await model.upsertInstallation({
            installationUuid: 'installation-uuid',
            organizationUuid: 'organization-uuid',
            userUuid: 'user-uuid',
            platform: 'ios',
            environment: 'sandbox',
            deviceToken: 'rotated-token',
        });

        expect(result.status).toBe('stored');
        expect(
            tracker.history.delete.some((query) =>
                query.sql.includes(AiAgentLiveActivitiesTableName),
            ),
        ).toBe(false);
        const insert = tracker.history.insert.find((query) =>
            query.sql.includes(MobilePushInstallationsTableName),
        );
        expect(insert?.bindings).toContain(fingerprintOf('rotated-token'));
    });

    it('clears push-to-start state when the installation environment changes', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).responseOnce([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                organization_uuid: 'organization-uuid',
                user_uuid: 'user-uuid',
                environment: 'sandbox',
            },
        ]);
        tracker.on
            .delete(AiAgentLiveActivityStartAttemptsTableName)
            .responseOnce([]);
        tracker.on.delete(MobilePushInstallationsTableName).responseOnce([]);
        tracker.on.insert(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                installation_uuid: 'installation-uuid',
                organization_uuid: 'organization-uuid',
                user_uuid: 'user-uuid',
                environment: 'production',
            },
        ]);

        await model.upsertInstallation({
            installationUuid: 'installation-uuid',
            organizationUuid: 'organization-uuid',
            userUuid: 'user-uuid',
            platform: 'ios',
            environment: 'production',
            deviceToken: 'new-device-token',
        });

        expect(
            tracker.history.delete.some((query) =>
                query.sql.includes(AiAgentLiveActivityStartAttemptsTableName),
            ),
        ).toBe(true);
        expect(
            tracker.history.delete.some((query) =>
                query.sql.includes(AiAgentLiveActivitiesTableName),
            ),
        ).toBe(false);
        const insert = tracker.history.insert.find((query) =>
            query.sql.includes(MobilePushInstallationsTableName),
        );
        expect(insert?.sql).toContain('"encrypted_push_to_start_token" = $');
        expect(insert?.sql).toContain('"push_to_start_token_fingerprint" = $');
        expect(insert?.bindings.filter((value) => value === null)).toHaveLength(
            2,
        );
    });

    it('releases a device token fingerprint held by the other platform', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).responseOnce([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([]);
        tracker.on.delete(MobilePushInstallationsTableName).responseOnce([]);
        tracker.on.insert(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
                installation_uuid: 'android-installation-uuid',
                organization_uuid: 'organization-uuid',
                user_uuid: 'user-uuid',
                platform: 'android',
                environment: 'production',
            },
        ]);

        await model.upsertInstallation({
            installationUuid: 'android-installation-uuid',
            organizationUuid: 'organization-uuid',
            userUuid: 'user-uuid',
            platform: 'android',
            environment: 'production',
            deviceToken: 'shared-device-token',
        });

        const cleanup = tracker.history.delete.find((query) =>
            query.sql.includes(MobilePushInstallationsTableName),
        );
        expect(cleanup?.sql).toContain('"environment" = $');
        expect(cleanup?.sql).toContain('"device_token_fingerprint" = $');
        expect(cleanup?.sql).not.toContain('"platform"');
        expect(cleanup?.bindings).toEqual(
            expect.arrayContaining([
                'production',
                'android-installation-uuid',
                expect.stringMatching(/^[a-f0-9]{64}$/),
            ]),
        );
    });

    it('preserves pending, retryable, and sent attempts during same-installation token rotation', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).response([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'stored-installation-uuid',
            },
        ]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([]);
        tracker.on.update(MobilePushInstallationsTableName).responseOnce(1);

        await expect(
            model.registerPushToStartToken({
                installationUuid: 'installation-uuid',
                organizationUuid: 'organization-uuid',
                userUuid: 'user-uuid',
                environment: 'sandbox',
                pushToken: 'push-to-start-token',
            }),
        ).resolves.toBe(true);

        const update = tracker.history.update[0];
        expect(update.bindings).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^[a-f0-9]{64}$/),
                'installation-uuid',
                'organization-uuid',
                'user-uuid',
            ]),
        );
        expect(
            update.bindings.some(
                (value) =>
                    Buffer.isBuffer(value) &&
                    value.toString('utf8') === 'encrypted:push-to-start-token',
            ),
        ).toBe(true);
        expect(update.bindings).not.toContain('push-to-start-token');
        expect(tracker.history.all[0].sql).toContain('pg_advisory_xact_lock');
        expect(tracker.history.all[0].bindings).toEqual([
            expect.stringMatching(/^push-to-start:[a-f0-9]{64}$/),
        ]);
        expect(tracker.history.all[1].bindings).toEqual(['installation-uuid']);
        expect(
            tracker.history.delete.some((query) =>
                query.sql.includes(AiAgentLiveActivityStartAttemptsTableName),
            ),
        ).toBe(false);
    });

    it('preserves an existing same-owner token binding', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).response([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'target-storage-uuid',
            },
        ]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'source-storage-uuid',
                organization_uuid: 'organization-uuid',
                user_uuid: 'user-uuid',
            },
        ]);

        await expect(
            model.registerPushToStartToken({
                installationUuid: 'target-installation-uuid',
                organizationUuid: 'organization-uuid',
                userUuid: 'user-uuid',
                environment: 'sandbox',
                pushToken: 'push-to-start-token',
            }),
        ).resolves.toBe(false);

        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
    });

    it('preserves a token bound to a foreign owner', async () => {
        tracker.on.any(/pg_advisory_xact_lock/).response([]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'target-storage-uuid',
            },
        ]);
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'foreign-storage-uuid',
                organization_uuid: 'foreign-organization-uuid',
                user_uuid: 'foreign-user-uuid',
            },
        ]);

        await expect(
            model.registerPushToStartToken({
                installationUuid: 'target-installation-uuid',
                organizationUuid: 'organization-uuid',
                userUuid: 'user-uuid',
                environment: 'sandbox',
                pushToken: 'push-to-start-token',
            }),
        ).resolves.toBe(false);

        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
    });

    it('clears only the push-to-start token fingerprint used by the attempt', async () => {
        tracker.on.update(MobilePushInstallationsTableName).responseOnce(0);

        await expect(
            model.clearPushToStartTokenIfFingerprintMatches({
                installationUuid: 'installation-uuid',
                organizationUuid: 'organization-uuid',
                userUuid: 'user-uuid',
                pushTokenFingerprint: 'old-fingerprint',
            }),
        ).resolves.toBe(false);

        expect(tracker.history.update[0].sql).toContain(
            '"push_to_start_token_fingerprint" = $',
        );
        expect(tracker.history.update[0].bindings).toEqual(
            expect.arrayContaining([
                null,
                null,
                'installation-uuid',
                'organization-uuid',
                'user-uuid',
                'old-fingerprint',
            ]),
        );
    });

    it('locks eligible and excluded rows in one ordered selection', async () => {
        tracker.on.select(MobilePushInstallationsTableName).responseOnce([
            {
                mobile_push_installation_uuid: 'eligible-b',
                installation_uuid: 'installation-b',
            },
            {
                mobile_push_installation_uuid: 'eligible-a',
                installation_uuid: 'installation-a',
            },
            {
                mobile_push_installation_uuid: 'origin-installation',
                installation_uuid: 'origin-public-installation',
            },
        ]);
        tracker.on
            .insert(AiAgentLiveActivityStartAttemptsTableName)
            .responseOnce([]);
        tracker.on
            .select(AiAgentLiveActivityStartAttemptsTableName)
            .responseOnce([
                {
                    liveActivityStartAttemptUuid: 'attempt-a',
                    installationUuid: 'installation-a',
                },
                {
                    liveActivityStartAttemptUuid: 'attempt-b',
                    installationUuid: 'installation-b',
                },
            ]);

        const result = await model.createLiveActivityStartAttempts({
            organizationUuid: 'organization-uuid',
            userUuid: 'user-uuid',
            promptUuid: 'prompt-uuid',
            excludedMobilePushInstallationUuid: 'origin-installation',
            environments: ['sandbox'],
        });

        expect(result.map(({ installationUuid }) => installationUuid)).toEqual([
            'installation-a',
            'installation-b',
        ]);
        expect(tracker.history.select[0].sql).toContain('for share');
        expect(tracker.history.select[0].sql).toContain(
            'or "mobile_push_installation_uuid" = $',
        );
        expect(tracker.history.select[0].sql).toContain(
            'order by "installation_uuid" asc',
        );
        const insert = tracker.history.insert[0];
        expect(insert.sql).toContain(
            'on conflict ("mobile_push_installation_uuid", "prompt_uuid") do nothing',
        );
        expect(insert.bindings).toEqual(
            expect.arrayContaining([
                'origin-installation',
                'excluded',
                'eligible-a',
                'pending',
                'eligible-b',
            ]),
        );
    });

    it('claims an attempt with one conditional state transition', async () => {
        tracker.on
            .update(AiAgentLiveActivityStartAttemptsTableName)
            .responseOnce([
                { live_activity_start_attempt_uuid: 'attempt-uuid' },
            ]);
        tracker.on
            .select(AiAgentLiveActivityStartAttemptsTableName)
            .responseOnce([
                {
                    liveActivityStartAttemptUuid: 'attempt-uuid',
                    liveActivityUuid: 'activity-uuid',
                    installationUuid: 'installation-uuid',
                    organizationUuid: 'organization-uuid',
                    userUuid: 'user-uuid',
                    promptUuid: 'prompt-uuid',
                    environment: 'sandbox',
                    encryptedPushToStartToken: Buffer.from(
                        'encrypted:push-to-start-token',
                    ),
                    pushToStartTokenFingerprint: 'fingerprint',
                    status: 'processing',
                    attemptCount: 1,
                },
            ]);

        const result = await model.claimLiveActivityStartAttempt({
            liveActivityStartAttemptUuid: 'attempt-uuid',
            attemptedAt: new Date('2026-08-31T12:00:00.000Z'),
            retryProcessingBefore: new Date('2026-08-31T11:55:00.000Z'),
            maxAttempts: 5,
        });

        expect(result?.pushToStartToken).toBe('push-to-start-token');
        expect(tracker.history.update[0].sql).toContain('"status" in (');
        expect(tracker.history.update[0].sql).toContain('"attempt_count" < $');
        expect(tracker.history.update[0].sql).toContain('"attempt_count" + 1');
    });

    it('marks a completion only while the attempt is processing', async () => {
        tracker.on
            .update(AiAgentLiveActivityStartAttemptsTableName)
            .responseOnce(0);

        await expect(
            model.markLiveActivityStartAttempt({
                liveActivityStartAttemptUuid: 'attempt-uuid',
                status: 'sent',
                pushTokenFingerprint: 'fingerprint',
                completedAt: new Date('2026-08-31T12:00:00.000Z'),
            }),
        ).resolves.toBe(false);

        expect(tracker.history.update[0].sql).toContain('and "status" = $');
        expect(tracker.history.update[0].bindings).toContain('processing');
    });

    it('encrypts and fingerprints a rotating Live Activity token', async () => {
        tracker.on.delete(AiAgentLiveActivitiesTableName).responseOnce([]);
        tracker.on.insert(AiAgentLiveActivitiesTableName).responseOnce([]);

        await model.upsertLiveActivity({
            liveActivityUuid: 'activity-uuid',
            mobilePushInstallationUuid: 'installation-uuid',
            organizationUuid: 'organization-uuid',
            userUuid: 'user-uuid',
            projectUuid: 'project-uuid',
            agentUuid: 'agent-uuid',
            threadUuid: 'thread-uuid',
            promptUuid: 'prompt-uuid',
            pushToken: 'activity-token',
        });

        const insert = tracker.history.insert.find((query) =>
            query.sql.includes(AiAgentLiveActivitiesTableName),
        );
        expect(insert?.sql).toContain(
            'on conflict ("live_activity_uuid") do update',
        );
        expect(
            insert?.bindings.some(
                (binding) =>
                    Buffer.isBuffer(binding) &&
                    binding.toString('utf8') === 'encrypted:activity-token',
            ),
        ).toBe(true);
        expect(insert?.bindings).not.toContain('activity-token');
        expect(insert?.sql).toContain('"ended_at" =');
    });

    it('decrypts the delivery token without returning ciphertext', async () => {
        tracker.on.select(AiAgentLiveActivitiesTableName).responseOnce([
            {
                liveActivityUuid: 'activity-uuid',
                mobilePushInstallationUuid: 'installation-uuid',
                installationUuid: 'public-installation-uuid',
                organizationUuid: 'organization-uuid',
                userUuid: 'user-uuid',
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
                environment: 'sandbox',
                encryptedDeviceToken: Buffer.from('encrypted:device-token'),
                encryptedPushToken: Buffer.from('encrypted:activity-token'),
                lastDeliveredState: null,
                lastDeliveredStateChangedAt: null,
                staleAt: null,
                endedAt: null,
                completionAlertCompletedAt: null,
            },
        ]);

        const result = await model.findLiveActivity('activity-uuid');

        expect(result?.pushToken).toBe('activity-token');
        expect(result?.deviceToken).toBe('device-token');
        expect(result).not.toHaveProperty('encryptedPushToken');
        expect(result).not.toHaveProperty('encryptedDeviceToken');
    });

    it('returns all active Live Activities for a thread in one query', async () => {
        tracker.on.select(AiAgentLiveActivitiesTableName).responseOnce([
            {
                liveActivityUuid: 'first-activity-uuid',
                organizationUuid: 'first-organization-uuid',
                projectUuid: 'first-project-uuid',
                userUuid: 'first-user-uuid',
            },
            {
                liveActivityUuid: 'second-activity-uuid',
                organizationUuid: 'second-organization-uuid',
                projectUuid: 'second-project-uuid',
                userUuid: 'second-user-uuid',
            },
        ]);

        const result =
            await model.findActiveLiveActivitiesForThread('thread-uuid');

        expect(result).toEqual([
            {
                liveActivityUuid: 'first-activity-uuid',
                organizationUuid: 'first-organization-uuid',
                projectUuid: 'first-project-uuid',
                userUuid: 'first-user-uuid',
            },
            {
                liveActivityUuid: 'second-activity-uuid',
                organizationUuid: 'second-organization-uuid',
                projectUuid: 'second-project-uuid',
                userUuid: 'second-user-uuid',
            },
        ]);
        expect(tracker.history.all).toHaveLength(1);
        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.select[0].sql).toBe(
            'select "live_activity_uuid" as "liveActivityUuid", "organization_uuid" as "organizationUuid", "project_uuid" as "projectUuid", "user_uuid" as "userUuid" from "ai_agent_live_activities" where "thread_uuid" = $1 and "ended_at" is null',
        );
        expect(tracker.history.select[0].bindings).toEqual(['thread-uuid']);
    });
});
