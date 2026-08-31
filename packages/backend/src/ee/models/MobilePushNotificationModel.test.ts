import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    AiAgentLiveActivitiesTableName,
    MobilePushInstallationsTableName,
} from '../database/entities/mobilePushNotifications';
import { MobilePushNotificationModel } from './MobilePushNotificationModel';

const encryptionUtil = {
    encrypt: (value: string): Buffer => Buffer.from(`encrypted:${value}`),
    decrypt: (value: Buffer): string =>
        value.toString('utf8').replace(/^encrypted:/, ''),
} as unknown as EncryptionUtil;

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
    it('encrypts and fingerprints a rotating device token', async () => {
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
