import { AuthorizationError, AuthTokenPrefix } from '@lightdash/common';
import { AsyncLocalStorage } from 'async_hooks';
import { type AgentTokenProvider } from './agentConnections/agentTokenProvider';
import { type LifecycleOperation } from './agentConnections/lifecycle';
import { type AgentConnectionSlot } from './agentConnections/schema';
import { type Config } from './config';

export type Credential =
    | { kind: 'human_api_key'; token: string }
    | { kind: 'service_account'; token: string }
    | { kind: 'agent_connection'; token: string; slot: AgentConnectionSlot };
type Invocation = {
    readonly selection: string | null;
    provider: Promise<AgentTokenProvider> | null;
};
const invocations = new AsyncLocalStorage<Invocation>();
let selectedInvocations = 0;
export const requireInvocationContext = (): void => {
    if (selectedInvocations > 0 && invocations.getStore() === undefined)
        throw new Error(
            'An agent connection is selected for this run, so this request cannot use your personal CLI login.',
        );
};
const isThenable = (value: unknown): value is PromiseLike<unknown> =>
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function';
export const validateAgentConnectionSelection = (
    selection: string | null,
): string | null => {
    if (
        selection !== null &&
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(selection)
    )
        throw new Error(
            'Select a non-empty agent connection slot name (letters, numbers, dots, underscores and hyphens).',
        );
    return selection;
};
export const runWithParsedAgentConnectionSelection = <T>(
    readSelection: () => string | null,
    mayBeSelected: boolean,
    action: () => T,
): T => {
    let captured: { value: string | null } | null = null;
    let counted = false;
    let settled = false;
    const count = () => {
        if (!counted && !settled) {
            selectedInvocations += 1;
            counted = true;
        }
    };
    const uncount = () => {
        if (counted) {
            selectedInvocations -= 1;
            counted = false;
        }
    };
    const release = () => {
        settled = true;
        uncount();
    };
    // Counted before the selection is parsed, so the guard has no gap.
    if (mayBeSelected) count();
    return invocations.run(
        {
            get selection() {
                if (captured === null) {
                    captured = {
                        value: validateAgentConnectionSelection(
                            readSelection(),
                        ),
                    };
                    if (captured.value === null) uncount();
                    else count();
                }
                return captured.value;
            },
            provider: null,
        },
        () => {
            let asynchronous = false;
            try {
                const result = action();
                if (isThenable(result)) {
                    asynchronous = true;
                    return Promise.resolve(result).finally(release) as T;
                }
                return result;
            } finally {
                if (!asynchronous) release();
            }
        },
    );
};
export const getAgentConnectionSelection = (): string | null => {
    requireInvocationContext();
    const invocation = invocations.getStore();
    return invocation === undefined
        ? validateAgentConnectionSelection(
              process.env.LIGHTDASH_AGENT_CONNECTION ?? null,
          )
        : invocation.selection;
};
export const runWithAgentConnectionSelection = <T>(
    selection: string | null,
    action: () => T,
): T =>
    runWithParsedAgentConnectionSelection(
        () => selection,
        selection !== null,
        () => {
            getAgentConnectionSelection();
            return action();
        },
    );
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
    let selectedProvider = provider;
    if (selectedProvider === null) {
        const invocation = invocations.getStore();
        const createProvider = async () => {
            const { AgentTokenProvider: Provider } =
                await import('./agentConnections/agentTokenProvider');
            return new Provider();
        };
        selectedProvider = await (invocation === undefined
            ? createProvider()
            : (invocation.provider ??= createProvider()));
    }
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

export const getAgentConnectionChildEnvironment = async (
    overrides: NodeJS.ProcessEnv = {},
): Promise<NodeJS.ProcessEnv> => {
    const selection = getAgentConnectionSelection();
    if (selection === null)
        throw new Error('An agent connection selection is required.');
    const { getConfig } = await import('./config');
    const credential = await resolveCredential(
        await (getAgentConnectionSelection() === null
            ? getConfig()
            : getConfig({ readOnly: true })),
    );
    if (credential.kind !== 'agent_connection')
        throw new Error(
            'The selected child requires an agent connection credential.',
        );
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...overrides,
        LIGHTDASH_AGENT_CONNECTION: selection,
    };
    delete env.LIGHTDASH_API_KEY;
    return env;
};
