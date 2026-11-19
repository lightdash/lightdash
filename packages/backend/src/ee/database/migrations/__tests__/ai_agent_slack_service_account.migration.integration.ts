import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { AiAgentModel } from '../../../models/AiAgentModel';

vi.mock('../../../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

describe('Slack channel service account on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: AiAgentModel;
    let organizationUuid: string;
    let agentUuid: string;
    let serviceAccountUuid: string;
    let serviceAccountUserUuid: string;

    const createUser = async () =>
        (
            await database('users')
                .insert({
                    first_name: 'Slack',
                    last_name: 'Identity',
                    is_active: true,
                    is_marketing_opted_in: false,
                    is_setup_complete: true,
                    is_tracking_anonymized: false,
                })
                .returning('user_uuid')
        )[0].user_uuid;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        model = new AiAgentModel({
            database,
            lightdashConfig: lightdashConfigMock,
        } as ConstructorParameters<typeof AiAgentModel>[0]);

        const [org] = await database('organizations')
            .insert({ organization_name: 'Slack identity' })
            .returning('*');
        organizationUuid = org.organization_uuid;
        const userUuid = await createUser();
        const [project] = await database('projects')
            .insert({
                name: 'Slack identity',
                organization_id: org.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: userUuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning('project_uuid');
        const agent = await model.createAgent({
            organizationUuid,
            projectUuid: project.project_uuid,
            name: 'Slack agent',
            description: null,
            tags: null,
            integrations: [],
            instruction: null,
            imageUrl: null,
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
            enableDataAccess: true,
            enableSelfImprovement: false,
            version: 1,
        } as Parameters<AiAgentModel['createAgent']>[0]);
        agentUuid = agent.uuid;

        serviceAccountUserUuid = await createUser();
        const [serviceAccount] = await database('service_accounts')
            .insert({
                organization_uuid: organizationUuid,
                token_hash: randomUUID(),
                description: 'slack-analytics-bot',
                expires_at: null,
                created_by_user_uuid: userUuid,
                scopes: ['org:read'],
                service_account_user_uuid: serviceAccountUserUuid,
            })
            .returning('service_account_uuid');
        serviceAccountUuid = serviceAccount.service_account_uuid;
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    const channelsOf = async () =>
        (await model.getAgent({ organizationUuid, agentUuid })).integrations;

    it('stores, keeps on omission, and clears the channel service account', async () => {
        await model.updateAgent({
            agentUuid,
            organizationUuid,
            integrations: [
                { type: 'slack', channelId: 'C_SHARED', serviceAccountUuid },
                { type: 'slack', channelId: 'C_PEOPLE' },
            ],
        });
        expect(await channelsOf()).toEqual(
            expect.arrayContaining([
                { type: 'slack', channelId: 'C_SHARED', serviceAccountUuid },
                {
                    type: 'slack',
                    channelId: 'C_PEOPLE',
                    serviceAccountUuid: null,
                },
            ]),
        );
        expect(
            await model.findSlackChannelServiceAccount({
                organizationUuid,
                slackChannelId: 'C_SHARED',
            }),
        ).toEqual({
            agentUuid,
            serviceAccountUuid,
            serviceAccountUserUuid,
            name: 'slack-analytics-bot',
        });

        await database.raw(
            "update service_accounts set expires_at = now() - interval '1 minute' where service_account_uuid = ?",
            [serviceAccountUuid],
        );
        expect(
            await model.findSlackChannelServiceAccount({
                organizationUuid,
                slackChannelId: 'C_SHARED',
            }),
        ).toBeNull();
        expect(
            await model.findUsableServiceAccountUuids(organizationUuid, [
                serviceAccountUuid,
            ]),
        ).toEqual([]);
        await database.raw(
            'update service_accounts set expires_at = null where service_account_uuid = ?',
            [serviceAccountUuid],
        );
        expect(
            await model.findSlackChannelServiceAccount({
                organizationUuid,
                slackChannelId: 'C_PEOPLE',
            }),
        ).toBeNull();

        await model.updateAgent({
            agentUuid,
            organizationUuid,
            integrations: [{ type: 'slack', channelId: 'C_SHARED' }],
        });
        expect(await channelsOf()).toEqual([
            { type: 'slack', channelId: 'C_SHARED', serviceAccountUuid },
        ]);

        await model.updateAgent({
            agentUuid,
            organizationUuid,
            integrations: [
                {
                    type: 'slack',
                    channelId: 'C_SHARED',
                    serviceAccountUuid: null,
                },
            ],
        });
        expect(await channelsOf()).toEqual([
            {
                type: 'slack',
                channelId: 'C_SHARED',
                serviceAccountUuid: null,
            },
        ]);
    });

    it('falls back to the person asking when the service account is deleted', async () => {
        await model.updateAgent({
            agentUuid,
            organizationUuid,
            integrations: [
                { type: 'slack', channelId: 'C_SHARED', serviceAccountUuid },
            ],
        });
        await database('service_accounts')
            .where('service_account_uuid', serviceAccountUuid)
            .delete();

        expect(await channelsOf()).toEqual([
            {
                type: 'slack',
                channelId: 'C_SHARED',
                serviceAccountUuid: null,
            },
        ]);
        expect(
            await model.findUsableServiceAccountUuids(organizationUuid, [
                serviceAccountUuid,
            ]),
        ).toEqual([]);
    });
});
