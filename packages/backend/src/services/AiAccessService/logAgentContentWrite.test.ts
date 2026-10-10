import { AgentActorSurface } from '@lightdash/common';
import { type Knex } from 'knex';
import { EventEmitter } from 'node:events';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import Logger from '../../logging/logger';
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

test('does not fail an already committed write when durable insertion fails', async () => {
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
    ).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
});

test('transactional insert failures propagate so the domain write rolls back', async () => {
    const log = vi.spyOn(audit, 'logAuditEvent').mockImplementation(() => {});
    const model = {
        insert: vi.fn().mockRejectedValue(new Error('ledger unavailable')),
    };
    const trx = Object.assign(new EventEmitter(), {
        executionPromise: Promise.resolve(),
    }) as unknown as Knex.Transaction;
    await expect(
        agentExecutionContext.run(scope, () =>
            logAgentContentWrite({
                model,
                agentIdentity: scope.claim,
                ...content,
                trx,
            }),
        ),
    ).rejects.toThrow('ledger unavailable');
    expect(model.insert).toHaveBeenCalledWith(expect.any(Object), trx);
    expect(log).not.toHaveBeenCalled();
});

test('reports insertion failure using only safe identifiers', async () => {
    const log = vi.spyOn(Logger, 'error').mockImplementation(() => Logger);
    const model = {
        insert: vi
            .fn()
            .mockRejectedValue(new Error('secret SQL and arguments')),
    };
    await agentExecutionContext.run(scope, () =>
        logAgentContentWrite({
            model,
            agentIdentity: scope.claim,
            ...content,
        }),
    );
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
});

test('does not put service accounts in personUuid', async () => {
    const log = vi.spyOn(audit, 'logAuditEvent').mockImplementation(() => {});
    const claim = {
        ...scope.claim!,
        subject: { type: 'service_account' as const, uuid: 'service-account' },
    };
    await agentExecutionContext.run({ ...scope, claim }, () =>
        logAgentContentWrite({
            model: { insert: vi.fn().mockResolvedValue(undefined) },
            agentIdentity: claim,
            ...content,
        }),
    );
    expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
            resource: expect.objectContaining({
                metadata: expect.objectContaining({
                    personUuid: null,
                    subjectType: 'service_account',
                }),
            }),
        }),
    );
});

test('transactional audit waits for commit and skips rollback', async () => {
    const log = vi.spyOn(audit, 'logAuditEvent').mockImplementation(() => {});
    const model = { insert: vi.fn().mockResolvedValue(undefined) };
    let commit!: () => void;
    const trx = Object.assign(new EventEmitter(), {
        executionPromise: new Promise<void>((resolve) => {
            commit = resolve;
        }),
    }) as unknown as Knex.Transaction;
    await agentExecutionContext.run(scope, () =>
        logAgentContentWrite({
            model,
            agentIdentity: scope.claim,
            ...content,
            trx,
        }),
    );
    expect(log).not.toHaveBeenCalled();
    trx.emit('query', { sql: 'COMMIT;' });
    commit();
    await trx.executionPromise;
    expect(log).toHaveBeenCalledOnce();
    log.mockClear();
    let rollback!: (error: Error) => void;
    const rolledBack = Object.assign(new EventEmitter(), {
        executionPromise: new Promise<void>((_, reject) => {
            rollback = reject;
        }),
    }) as unknown as Knex.Transaction;
    await agentExecutionContext.run(scope, () =>
        logAgentContentWrite({
            model,
            agentIdentity: scope.claim,
            ...content,
            trx: rolledBack,
        }),
    );
    rollback(new Error('domain failed'));
    await rolledBack.executionPromise.catch(() => {});
    expect(log).not.toHaveBeenCalled();
});

test('an explicit rollback without an error does not emit an allowed audit', async () => {
    const log = vi.spyOn(audit, 'logAuditEvent').mockImplementation(() => {});
    let finish!: () => void;
    const trx = Object.assign(new EventEmitter(), {
        executionPromise: new Promise<void>((resolve) => {
            finish = resolve;
        }),
    }) as unknown as Knex.Transaction;
    await agentExecutionContext.run(scope, () =>
        logAgentContentWrite({
            model: { insert: vi.fn().mockResolvedValue(undefined) },
            agentIdentity: scope.claim,
            ...content,
            trx,
        }),
    );
    trx.emit('query', { sql: 'ROLLBACK;' });
    finish();
    await trx.executionPromise;
    expect(log).not.toHaveBeenCalled();
});
