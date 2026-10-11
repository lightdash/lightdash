import { AuthorizationError, AuthTokenPrefix } from '@lightdash/common';
import { type AgentTokenProvider } from './agentConnections/agentTokenProvider';
import { type LifecycleOperation } from './agentConnections/lifecycle';
import { type AgentConnectionSlot } from './agentConnections/schema';
import { type Config } from './config';

export type Credential =
    | { kind: 'human_api_key'; token: string }
    | { kind: 'service_account'; token: string }
    | { kind: 'agent_connection'; token: string; slot: AgentConnectionSlot };
let selectedFlag: string | null = null;
let tokenProvider: AgentTokenProvider | null = null;
export const resetCredentialContext = (): void => {
    selectedFlag = null;
    tokenProvider = null;
};
export const setAgentConnectionSelection = (selection: string | null): void => {
    selectedFlag = selection;
};
export const getAgentConnectionSelection = (): string | null => {
    const selection =
        selectedFlag ?? process.env.LIGHTDASH_AGENT_CONNECTION ?? null;
    if (
        selection !== null &&
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(selection)
    )
        throw new Error(
            'Select a non-empty agent connection slot name (letters, numbers, dots, underscores and hyphens).',
        );
    return selection;
};
export const humanCredential = (token: string): Credential => ({
    kind: token?.startsWith(AuthTokenPrefix.SERVICE_ACCOUNT)
        ? 'service_account'
        : 'human_api_key',
    token,
});
export const resolveCredential = async (
    config: Config,
    provider: AgentTokenProvider | null = null,
    rejectedGeneration: number | null = null,
    lifecycle: LifecycleOperation | null = null,
): Promise<Credential> => {
    const name = getAgentConnectionSelection();
    if (name === null) {
        if (lifecycle !== null)
            throw new Error('An agent connection selection is required.');
        if (!(config.context?.apiKey && config.context.serverUrl))
            throw new AuthorizationError(
                `Not logged in. Run 'lightdash login --help'`,
            );
        return humanCredential(config.context.apiKey);
    }
    if (
        !config.context?.serverUrl ||
        !config.user?.userUuid ||
        !config.user.organizationUuid
    )
        throw new Error(
            'This agent connection requires the configured instance, person and organisation. Use your personal CLI login first.',
        );
    const { canonicalInstanceUrl } = await import('./agentConnections/schema');
    if (provider === null && tokenProvider === null) {
        const { AgentTokenProvider: Provider } =
            await import('./agentConnections/agentTokenProvider');
        tokenProvider ??= new Provider();
    }
    const selectedProvider = provider ?? tokenProvider;
    if (selectedProvider === null)
        throw new Error('Agent connection provider is unavailable.');
    const getToken =
        lifecycle === null
            ? selectedProvider.getToken.bind(selectedProvider)
            : (
                  key: import('./agentConnections/schema').SlotKey,
                  rejected: number | null,
                  proxy: string | null,
              ) =>
                  selectedProvider.getLifecycleToken(
                      key,
                      lifecycle,
                      rejected,
                      proxy,
                  );
    const slot = await getToken(
        {
            instanceUrl: canonicalInstanceUrl(config.context.serverUrl),
            personUuid: config.user.userUuid,
            organizationUuid: config.user.organizationUuid,
            name,
        },
        rejectedGeneration,
        config.context.proxyAuthorization ?? null,
    );
    return { kind: 'agent_connection', token: slot.tokens.accessToken, slot };
};
export const personalLoginRequired =
    'This command requires your personal CLI login. Remove --agent-connection and unset LIGHTDASH_AGENT_CONNECTION.';
export const agentCommandUnavailable =
    'This command is not available with an agent connection yet. Remove --agent-connection and unset LIGHTDASH_AGENT_CONNECTION to use your personal CLI login.';
export const refuseAgentConnection = (personalOnly = false): void => {
    if (getAgentConnectionSelection() !== null)
        throw new Error(
            personalOnly ? personalLoginRequired : agentCommandUnavailable,
        );
};
