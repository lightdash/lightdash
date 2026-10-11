import {
    AgentConnectionRequestError,
    connectionKey,
    revocationRecovery,
    sameGeneration,
    selectLifecycleSlot,
    settingsUrl,
} from '../agentConnections/lifecycle';
import {
    capturePersonalRecovery,
    PersonalRecoveryError,
} from '../agentConnections/personalRecovery';
import { type AgentConnectionSlot } from '../agentConnections/schema';
import {
    connectionResponse,
    responseRecord,
} from '../agentConnections/statusResponse';
import { AgentConnectionStore } from '../agentConnections/store';
import { getConfig } from '../config';
import {
    getAgentConnectionSelection,
    runWithAgentConnectionSelection,
} from '../credentials';
import { lightdashRawApi } from './dbt/apiClient';

export type AgentRevokeOptions = {
    name: string;
    json?: boolean;
    human?: boolean;
};
export const agentRevokeHandler = async (
    options: AgentRevokeOptions,
): Promise<void> => {
    if (options.human && getAgentConnectionSelection() !== null)
        throw new Error(
            '--human and a global agent selection conflict. Remove --agent-connection and unset LIGHTDASH_AGENT_CONNECTION.',
        );
    const selection = selectLifecycleSlot(options.name);
    return runWithAgentConnectionSelection(
        options.human ? null : selection,
        async () => {
            const config = await getConfig({ readOnly: true });
            const recover = options.human
                ? capturePersonalRecovery(config)
                : null;
            const key = connectionKey(config, options.name);
            const store = new AgentConnectionStore();
            let slot: AgentConnectionSlot | null = null;
            let confirmed = false;
            let localRemoved = false;
            let error: string | null = null;
            let recovery: ReturnType<NonNullable<typeof recover>> | null = null;
            try {
                if (key === null)
                    throw new Error(
                        'This connection requires a matching instance, person and organisation.',
                    );
                slot = await store.readSlot(key);
                if (slot === null)
                    throw new Error(
                        'No agent connection credential. Run lightdash agent connect.',
                    );
                if (options.human) {
                    if (!recover) throw new PersonalRecoveryError();
                    recovery = recover(slot);
                    const response = await recovery.fetch({
                        method: 'GET',
                        url: '/api/v1/user',
                        body: undefined,
                        signal: AbortSignal.timeout(15_000),
                    });
                    const value: unknown = await response.json();
                    const envelope = responseRecord(value);
                    const person = responseRecord(envelope.results);
                    if (
                        envelope.status !== 'ok' ||
                        person.userUuid !== slot.personUuid ||
                        person.organizationUuid !== slot.organizationUuid
                    )
                        throw new PersonalRecoveryError();
                } else if (
                    Date.parse(slot.tokens.accessTokenExpiresAt) <=
                        Date.now() ||
                    Date.parse(slot.grantExpiresAt) <= Date.now()
                ) {
                    throw new Error(revocationRecovery);
                }
                const original = slot;
                await store.withLock(async (locked) => {
                    const current = await locked.readSlot(original);
                    if (!sameGeneration(current, original))
                        throw new Error(
                            'The local connection changed. Run the command again.',
                        );
                    await locked.saveSlot({
                        ...current,
                        revokeState: {
                            kind: 'unconfirmed',
                            attemptedAt: new Date().toISOString(),
                        },
                    });
                });
                const response = recovery
                    ? await recovery.fetch({
                          method: 'DELETE',
                          url: `/api/v2/user/agent-connections/${slot.grantUuid}`,
                          body: undefined,
                          signal: AbortSignal.timeout(15_000),
                      })
                    : await lightdashRawApi({
                          method: 'DELETE',
                          url: `/api/v2/user/agent-connections/${slot.grantUuid}`,
                          body: undefined,
                          signal: AbortSignal.timeout(15_000),
                          lifecycle: {
                              kind: 'revoke',
                              grantUuid: slot.grantUuid,
                              generation: slot.tokens.generation,
                          },
                      });
                const value: unknown = await response.json();
                const checked = connectionResponse(value, slot, false);
                if (
                    checked.lastReported.status !== 'revoked' ||
                    checked.lastReported.revokedAt === null
                )
                    throw new Error('Revocation was not confirmed.');
                confirmed = true;
                localRemoved = await store.removeSlotIfUnchanged(slot);
                if (!localRemoved)
                    error =
                        'The server confirmed revocation, but the local slot changed and was kept.';
            } catch (failure) {
                if (confirmed)
                    error =
                        'The server confirmed revocation, but the local credential could not be removed.';
                else if (slot === null)
                    error =
                        key === null
                            ? 'This connection requires a matching instance, person and organisation.'
                            : 'No valid agent connection credential was found. Run lightdash agent connect.';
                else if (
                    !options.human &&
                    ((failure instanceof AgentConnectionRequestError &&
                        failure.state === 'rejected') ||
                        Date.parse(slot.tokens.accessTokenExpiresAt) <=
                            Date.now() ||
                        Date.parse(slot.grantExpiresAt) <= Date.now())
                )
                    error = revocationRecovery;
                else
                    error =
                        options.human &&
                        failure instanceof PersonalRecoveryError
                            ? 'The personal CLI login does not match this connection person and organisation.'
                            : 'Revocation was not confirmed. The local slot was kept.';
            }
            const result = {
                version: 1,
                slot: options.name,
                grantUuid: slot?.grantUuid ?? null,
                confirmed,
                localRemoved,
                settingsUrl: config.context?.serverUrl
                    ? settingsUrl(slot?.instanceUrl ?? config.context.serverUrl)
                    : null,
                error,
            };
            if (options.json) console.log(JSON.stringify(result));
            else if (confirmed && localRemoved)
                console.error(
                    `Agent connection revoked: ${options.name}. Local credential removed.`,
                );
            else {
                console.error(error);
                if (result.settingsUrl)
                    console.error(`Settings: ${result.settingsUrl}`);
            }
            process.exitCode = confirmed && localRemoved ? 0 : 1;
        },
    );
};
