import { type Config } from '../config';
import {
    getAgentConnectionSelection,
    validateAgentConnectionSelection,
} from '../credentials';
import {
    canonicalInstanceUrl,
    type AgentConnectionSlot,
    type SlotKey,
} from './schema';

export type LifecycleOperation = {
    kind: 'status' | 'revoke';
    grantUuid: string;
    generation: number;
};
export class AgentConnectionRequestError extends Error {
    constructor(public readonly state: 'rejected' | 'unreachable') {
        super(
            state === 'rejected'
                ? 'The server rejected this connection credential. Reconnect or check its status in the app.'
                : 'Could not reach the server. Connection status is unconfirmed.',
        );
    }
}
export const selectLifecycleSlot = (name: string | undefined): string => {
    const selection = getAgentConnectionSelection();
    if (name !== undefined && selection !== null && name !== selection)
        throw new Error(
            'The connection name and global agent selection conflict.',
        );
    const selected = name ?? selection;
    if (selected === null)
        throw new Error('Specify an agent connection with --name <slot>.');
    validateAgentConnectionSelection(selected);
    return selected;
};
export const connectionKey = (config: Config, name: string): SlotKey | null =>
    config.context?.serverUrl &&
    config.user?.userUuid &&
    config.user.organizationUuid
        ? {
              instanceUrl: canonicalInstanceUrl(config.context.serverUrl),
              personUuid: config.user.userUuid,
              organizationUuid: config.user.organizationUuid,
              name,
          }
        : null;
export const sameGeneration = (
    current: AgentConnectionSlot | null,
    slot: AgentConnectionSlot,
): current is AgentConnectionSlot =>
    current !== null &&
    current.grantUuid === slot.grantUuid &&
    current.tokens.generation === slot.tokens.generation;
export const settingsUrl = (instanceUrl: string): string =>
    `${instanceUrl}/generalSettings/myAgentConnections`;
export const revocationRecovery =
    'This credential cannot confirm revocation. Revoke the connection in the app, or use agent revoke --name <slot> --human with a matching personal login.';
