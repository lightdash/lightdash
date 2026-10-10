import { AgentActorSurface } from '@lightdash/common';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import * as audit from '../../logging/winston';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from './agentExecutionContext';
import {
    logAgentContentWrite,
    recordAgentAction,
} from './logAgentContentWrite';

const scope = createAgentExecutionContext({
    account: fromSession(defaultSessionUser),
    surface: AgentActorSurface.IN_APP_AGENT,
    clientId: 'lightdash-chat',
    agentUuid: 'agent',
    agentIdentityEnabled: true,
});
const content = {
    projectUuid: 'project',
    objectType: 'chart',
    objectUuid: 'chart',
    versionUuid: 'version',
    action: 'create',
} as const;

afterEach(() => vi.restoreAllMocks());

test('persists an allowed write before emitting the audit event', async () => {
    const log = vi.spyOn(audit, 'logAuditEvent').mockImplementation(() => {});
    const model = {
        insert: vi.fn().mockImplementation(async () => {
            expect(log).not.toHaveBeenCalled();
        }),
    };
    await agentExecutionContext.run(scope, () =>
        logAgentContentWrite({ model, agentIdentity: scope.claim, ...content }),
    );
    expect(model.insert).toHaveBeenCalledExactlyOnceWith({
        organization_uuid: defaultSessionUser.organizationUuid,
        project_uuid: 'project',
        agent_identity: scope.claim,
        object_type: 'chart',
        object_uuid: 'chart',
        object_id: null,
        version_uuid: 'version',
        action: 'create',
        outcome: 'allowed',
        policy_layer: null,
        reason_code: null,
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            status: 'allowed',
            resource: expect.objectContaining({
                metadata: expect.objectContaining({
                    event: 'agent_content.write',
                    policyLayer: null,
                    reasonCode: null,
                }),
            }),
        }),
    );
});

test('supports denied actions with the deciding policy and stable reason', async () => {
    const log = vi.spyOn(audit, 'logAuditEvent').mockImplementation(() => {});
    const model = { insert: vi.fn().mockResolvedValue(undefined) };
    await agentExecutionContext.run(scope, () =>
        recordAgentAction({
            model,
            agentIdentity: scope.claim,
            ...content,
            objectId: null,
            outcome: 'denied',
            policyLayer: 'casl',
            reasonCode: 'content_create_forbidden',
        }),
    );
    expect(model.insert).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            outcome: 'denied',
            policy_layer: 'casl',
            reason_code: 'content_create_forbidden',
        }),
    );
    expect(log).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            status: 'denied',
            resource: expect.objectContaining({
                metadata: expect.objectContaining({
                    event: 'agent_action.refused',
                    policyLayer: 'casl',
                    reasonCode: 'content_create_forbidden',
                }),
            }),
        }),
    );
});

test('null claims and flag-off scopes write neither destination', async () => {
    const log = vi.spyOn(audit, 'logAuditEvent').mockImplementation(() => {});
    const model = { insert: vi.fn().mockResolvedValue(undefined) };
    await logAgentContentWrite({ model, agentIdentity: null, ...content });
    await agentExecutionContext.run(
        { ...scope, agentIdentityEnabled: false },
        () =>
            logAgentContentWrite({
                model,
                agentIdentity: scope.claim,
                ...content,
            }),
    );
    expect(model.insert).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
});

test('does not emit a success event when durable insertion fails', async () => {
    const log = vi.spyOn(audit, 'logAuditEvent').mockImplementation(() => {});
    const model = {
        insert: vi.fn().mockRejectedValue(new Error('ledger unavailable')),
    };
    await expect(
        agentExecutionContext.run(scope, () =>
            logAgentContentWrite({
                model,
                agentIdentity: scope.claim,
                ...content,
            }),
        ),
    ).rejects.toThrow('ledger unavailable');
    expect(log).not.toHaveBeenCalled();
});
