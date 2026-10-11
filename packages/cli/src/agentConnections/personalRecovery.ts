import fetch from 'node-fetch';
import { type Config } from '../config';
import { humanCredential } from '../credentials';
import { buildRequestHeaders } from '../handlers/utils';
import { agentConnectionApiUrl } from './apiUrl';
import { canonicalInstanceUrl, type AgentConnectionSlot } from './schema';

export class PersonalRecoveryError extends Error {
    constructor() {
        super(
            'The personal CLI login does not match this connection person and organisation.',
        );
    }
}

export const capturePersonalRecovery = (config: Config) => {
    const instanceUrl = config.context?.serverUrl;
    const token = config.context?.apiKey;
    const headers = token ? buildRequestHeaders(token) : null;
    if (headers && config.context?.proxyAuthorization)
        headers['Proxy-Authorization'] = config.context.proxyAuthorization;
    return (slot: AgentConnectionSlot) => {
        if (
            !instanceUrl ||
            !token ||
            !headers ||
            humanCredential(token).kind !== 'human_api_key' ||
            canonicalInstanceUrl(instanceUrl) !== slot.instanceUrl
        )
            throw new PersonalRecoveryError();
        return {
            fetch: async ({
                method,
                url,
                signal,
            }: {
                method: 'GET' | 'DELETE';
                url: string;
                signal: AbortSignal;
                body: undefined;
            }) => {
                const response = await fetch(
                    agentConnectionApiUrl(instanceUrl, url),
                    { method, headers, signal, redirect: 'error' },
                );
                if (!response.ok)
                    throw new Error('Personal recovery was not confirmed.');
                return response;
            },
        };
    };
};
