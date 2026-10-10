import { AgentActorSurface, type SessionUser } from '@lightdash/common';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
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
