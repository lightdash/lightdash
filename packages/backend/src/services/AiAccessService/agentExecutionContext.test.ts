import {
    AgentActorSurface,
    QueryExecutionContext,
    QuerySurface,
} from '@lightdash/common';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import {
    agentExecutionContext,
    buildQueryAgentIdentity,
    createAgentExecutionContext,
    getContentWriteAgentIdentity,
} from './agentExecutionContext';

const writer = {
    userUuid: defaultSessionUser.userUuid,
    organizationUuid: defaultSessionUser.organizationUuid,
};
const scope = (agentUuid: string, enabled = true) =>
    createAgentExecutionContext({
        account: fromSession(defaultSessionUser),
        surface: AgentActorSurface.IN_APP_AGENT,
        clientId: 'lightdash-chat',
        agentUuid,
        agentIdentityEnabled: enabled,
    });

describe('trusted content write identity', () => {
    test('returns null outside a scope and with the flag off', () => {
        expect(getContentWriteAgentIdentity(writer)).toBeNull();
        agentExecutionContext.run(scope('agent', false), () => {
            expect(getContentWriteAgentIdentity(writer)).toBeNull();
        });
    });
    test('rejects a different writer or organization', () => {
        agentExecutionContext.run(scope('agent'), () => {
            expect(
                getContentWriteAgentIdentity({ ...writer, userUuid: 'other' }),
            ).toBeNull();
            expect(
                getContentWriteAgentIdentity({
                    ...writer,
                    organizationUuid: 'other',
                }),
            ).toBeNull();
        });
    });
    test('does not leak across interleaved asynchronous scopes', async () => {
        let release: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const first = agentExecutionContext.run(scope('first'), async () => {
            await gate;
            expect(getContentWriteAgentIdentity(writer)?.act.agent_uuid).toBe(
                'first',
            );
        });
        await agentExecutionContext.run(scope('second'), async () => {
            await Promise.resolve();
            expect(getContentWriteAgentIdentity(writer)?.act.agent_uuid).toBe(
                'second',
            );
            release();
        });
        await first;
        expect(getContentWriteAgentIdentity(writer)).toBeNull();
    });
    test('nested scopes cannot mutate the parent envelope or claim', () => {
        const parent = scope('parent');
        agentExecutionContext.run(parent, () => {
            agentExecutionContext.run(scope('child'), () => {
                expect(
                    getContentWriteAgentIdentity(writer)?.act.agent_uuid,
                ).toBe('child');
                expect(Object.isFrozen(parent)).toBe(true);
                expect(Object.isFrozen(parent.claim?.act)).toBe(true);
                expect(Object.isFrozen(parent.claim?.subject)).toBe(true);
                expect(() =>
                    Object.assign(parent.claim!.act, { agent_uuid: 'spoof' }),
                ).toThrow();
            });
            expect(getContentWriteAgentIdentity(writer)?.act.agent_uuid).toBe(
                'parent',
            );
        });
    });
    test('ignores caller-declared identity fields on writer input', () => {
        agentExecutionContext.run(scope('trusted'), () => {
            const request = {
                ...writer,
                headers: { 'x-agent-uuid': 'spoof', 'user-agent': 'spoof' },
                clientInfo: { name: 'spoof' },
                toolArgs: { agentIdentity: { act: { agent_uuid: 'spoof' } } },
            };
            expect(getContentWriteAgentIdentity(request)?.act.agent_uuid).toBe(
                'trusted',
            );
        });
    });
});

test.each([AgentActorSurface.IN_APP_AGENT, AgentActorSurface.SLACK_AGENT])(
    '%s shares the runtime agent UUID with query claims',
    (surface) => {
        const account = fromSession(defaultSessionUser);
        const envelope = createAgentExecutionContext({
            account,
            surface,
            clientId: 'client',
            agentUuid: 'runtime-agent',
            agentIdentityEnabled: true,
        });
        agentExecutionContext.run(envelope, () => {
            expect(
                buildQueryAgentIdentity(
                    account,
                    QueryExecutionContext.AI,
                    QuerySurface.APP,
                ),
            ).toEqual(envelope.claim);
        });
    },
);
