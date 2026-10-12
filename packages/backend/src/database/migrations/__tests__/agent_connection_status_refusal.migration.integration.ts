import { AgentCapability, AiAccessRefusalReason } from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';
import * as audit from '../../../logging/winston';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { fixture } from './launch-measurements/fixture.mock';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});
afterEach(() => {
    vi.restoreAllMocks();
});

it('keeps the real grant-bound refusal row and event while status before and after writes nothing', async () => {
    const f = await fixture(migrated.database);
    try {
        await f.grow(1);
        const connection = await f.bearer(1);
        const person = f.person();
        const policy = await f.models
            .getAgentCapabilityPolicyModel()
            .get(person.organizationUuid!);
        const changed = await f.models.getAgentCapabilityPolicyModel().save({
            organizationUuid: person.organizationUuid!,
            mode: 'managed',
            allowedCapabilities: [
                AgentCapability.Query,
                AgentCapability.DeployUpload,
            ],
            allowedGroupUuids: policy.allowedGroupUuids,
            systemRoleMatrix: policy.systemRoleMatrix,
            updatedByUserUuid: person.userUuid,
        });
        const auditEvent = vi
            .spyOn(audit, 'logAuditEvent')
            .mockImplementation(() => {});
        const status = () =>
            f.services
                .getAgentConnectionService()
                .status(
                    fromSession(person, ''),
                    connection.connection.grantUuid,
                );
        await status();
        expect.soft(await migrated.database('agent_action_log')).toEqual([]);
        expect
            .soft(
                auditEvent.mock.calls.filter(
                    ([event]) =>
                        event.resource.metadata?.event ===
                        'agent_action.refused',
                ),
            )
            .toHaveLength(0);
        const enforce = vi.spyOn(
            f.services.getAgentPermissionService(),
            'assertOperationWithRequest',
        );
        const admission = vi.spyOn(
            f.services.getAgentConnectionGrantService(),
            'assertRestOperation',
        );
        const authenticate = vi.spyOn(
            f.services.getAgentConnectionGrantService(),
            'authenticate',
        );
        const request = f.call(`/api/v1/projects/${f.projectUuids[0]}`, {
            headers: { authorization: `Bearer ${connection.token}` },
        });
        await expect(request).rejects.toThrow('403');
        await expect(request).rejects.toThrow(
            "Your organization's agent permissions do not allow Read and discover. Ask an admin to change Permissions on the Agents page.",
        );
        expect(authenticate).toHaveBeenCalledOnce();
        expect(enforce).toHaveBeenCalledOnce();
        expect(admission).toHaveBeenCalledOnce();
        const rows = await migrated.database('agent_action_log');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({
            agent_action_log_uuid: expect.any(String),
            occurred_at: expect.any(Date),
            organization_uuid: person.organizationUuid,
            project_uuid: f.projectUuids[0],
            agent_identity: {
                sub: `user:${person.userUuid}`,
                subject: { type: 'user', uuid: person.userUuid },
                act: {
                    sub: 'cli:lightdash-cli',
                    surface: 'cli',
                    client_id: 'lightdash-cli',
                    agent_uuid: null,
                    agent_connection_grant: {
                        grantUuid: connection.connection.grantUuid,
                        revision: 1,
                    },
                },
            },
            object_type: 'agent_operation',
            object_uuid: null,
            object_id: 'ProjectController.getProject',
            version_uuid: null,
            action: 'rest_operation',
            outcome: 'denied',
            policy_layer: 'organization_setting',
            reason_code: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            capability: AgentCapability.ReadDiscover,
            policy_version: changed.version,
        });
        const events = auditEvent.mock.calls.filter(
            ([event]) =>
                event.resource.metadata?.event === 'agent_action.refused',
        );
        expect(events).toHaveLength(1);
        expect(events[0][0]).toMatchObject({
            action: 'rest_operation',
            status: 'denied',
            actor: {
                type: 'oauth',
                uuid: person.userUuid,
                organizationUuid: person.organizationUuid,
            },
            resource: {
                type: 'agent_operation',
                organizationUuid: person.organizationUuid,
                projectUuid: f.projectUuids[0],
                metadata: {
                    event: 'agent_action.refused',
                    objectType: 'agent_operation',
                    objectUuid: null,
                    versionUuid: null,
                    action: 'rest_operation',
                    surface: 'cli',
                    clientId: 'lightdash-cli',
                    agentUuid: null,
                    personUuid: person.userUuid,
                    subjectType: 'user',
                    policyLayer: 'organization_setting',
                    reasonCode: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                },
            },
        });
        await status();
        expect(await migrated.database('agent_action_log')).toEqual(rows);
        expect(
            auditEvent.mock.calls.filter(
                ([event]) =>
                    event.resource.metadata?.event === 'agent_action.refused',
            ),
        ).toEqual(events);
    } finally {
        await f.close();
    }
});
