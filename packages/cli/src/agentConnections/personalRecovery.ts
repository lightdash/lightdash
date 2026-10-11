import fetch from 'node-fetch';
import { type Config } from '../config';
import { humanCredential } from '../credentials';
import { buildRequestHeaders } from '../handlers/utils';
import { agentConnectionApiUrl } from './apiUrl';
import { canonicalInstanceUrl, type AgentConnectionSlot } from './schema';

export class PersonalRecoveryError extends Error {
    constructor(mode: 'recovery' | 'bootstrap' = 'recovery') {
        super(
            mode === 'bootstrap'
                ? 'Agent connection approval requires a personal CLI login. Service account credentials cannot start approval.'
                : 'The personal CLI login does not match this connection person and organisation.',
        );
    }
}

const capturePersonalTransport = (config: Config) => {
    const instanceUrl = config.context?.serverUrl;
    const token = config.context?.apiKey;
    const headers = token ? buildRequestHeaders(token) : null;
    if (headers && config.context?.proxyAuthorization)
        headers['Proxy-Authorization'] = config.context.proxyAuthorization;
    return (expectedInstance: string | null) => {
        if (
            !instanceUrl ||
            !token ||
            !headers ||
            humanCredential(token).kind !== 'human_api_key' ||
            (expectedInstance !== null &&
                canonicalInstanceUrl(instanceUrl) !== expectedInstance)
        )
            throw new PersonalRecoveryError();
        const canonical = canonicalInstanceUrl(instanceUrl);
        return {
            instanceUrl: canonical,
            proxyAuthorization: headers['Proxy-Authorization'] ?? null,
            publicTextIsSafe: (value: string) =>
                [token, headers['Proxy-Authorization']].every(
                    (secret) =>
                        !secret ||
                        (!value.includes(secret) &&
                            !value.includes(encodeURIComponent(secret))),
                ),
            fetch: async ({
                method,
                url,
                signal,
                body,
            }: {
                method: 'GET' | 'DELETE' | 'POST';
                url: string;
                signal: AbortSignal;
                body: string | undefined;
            }) => {
                const response = await fetch(
                    agentConnectionApiUrl(instanceUrl, url),
                    { method, headers, signal, body, redirect: 'error' },
                );
                return response;
            },
        };
    };
};

export const capturePersonalBootstrap = (config: Config) => {
    try {
        return capturePersonalTransport(config)(null);
    } catch (error) {
        if (error instanceof PersonalRecoveryError)
            throw new PersonalRecoveryError('bootstrap');
        throw error;
    }
};

export const capturePersonalRecovery = (config: Config) => {
    const capture = capturePersonalTransport(config);
    return (slot: AgentConnectionSlot) => {
        const transport = capture(slot.instanceUrl);
        return {
            fetch: async (request: {
                method: 'GET' | 'DELETE';
                url: string;
                signal: AbortSignal;
                body: undefined;
            }) => {
                const response = await transport.fetch(request);
                if (!response.ok)
                    throw new Error('Personal recovery was not confirmed.');
                return response;
            },
        };
    };
};
