import { AgentActorSurface, type SessionUser } from '@lightdash/common';
import { type Knex } from 'knex';
import { EventEmitter } from 'node:events';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type OnContentVersionCreated } from '../../models/OnContentVersionCreated';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from './agentExecutionContext';

export const agentActionTestCases = [
    ['MCP', AgentActorSurface.MCP, true, 1],
    ['in-app', AgentActorSurface.IN_APP_AGENT, true, 1],
    ['Slack', AgentActorSurface.SLACK_AGENT, true, 1],
    ['person', null, true, 0],
    ['flag off', AgentActorSurface.MCP, false, 0],
] as const;

export const withAgentActionScope = <T>(
    user: SessionUser,
    surface: AgentActorSurface | null,
    enabled: boolean,
    run: () => T,
): T =>
    surface === null
        ? run()
        : agentExecutionContext.run(
              createAgentExecutionContext({
                  account: fromSession({ ...defaultSessionUser, ...user }),
                  surface,
                  clientId: 'test-client',
                  agentUuid: 'test-agent',
                  agentIdentityEnabled: enabled,
              }),
              run,
          );

export const runContentVersionCallback = async (
    callback: OnContentVersionCreated | undefined,
    versionUuid: string,
    objectUuid: string,
): Promise<void> => {
    const trx = new EventEmitter() as Knex.Transaction;
    let commit!: () => void;
    let rollback!: (error: unknown) => void;
    trx.executionPromise = new Promise<unknown[]>((resolve, reject) => {
        commit = () => resolve([]);
        rollback = reject;
    });
    void trx.executionPromise.catch(() => {});
    try {
        await callback?.(trx, versionUuid, objectUuid);
        trx.emit('query', { sql: 'COMMIT;' });
        commit();
        await trx.executionPromise;
    } catch (error) {
        rollback(error);
        throw error;
    }
};
