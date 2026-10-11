import fetch, { type RequestInit } from 'node-fetch';
import { canonicalInstanceUrl } from './schema';

export const agentConnectionApiUrl = (
    instanceUrl: string,
    input: string,
): string => {
    const instance = canonicalInstanceUrl(instanceUrl);
    const base = new URL(instance);
    const path = input.split(/[?#]/, 1)[0];
    const invalid = () =>
        new Error(
            'Agent connection requests must stay within the selected instance API.',
        );
    if (input !== input.trim() || input.startsWith('//') || path.includes('\\'))
        throw invalid();
    let decodedPath = path;
    while (/%[0-9a-f]{2}/i.test(decodedPath)) {
        if (/%(?:2f|5c|2e)/i.test(decodedPath)) throw invalid();
        try {
            decodedPath = decodeURIComponent(decodedPath);
        } catch {
            throw invalid();
        }
    }
    const destination = new URL(
        /^[a-z][a-z0-9+.-]*:/i.test(input)
            ? input
            : `${instance}/${input.replace(/^\//, '')}`,
    );
    if (
        destination.origin !== base.origin ||
        destination.username ||
        destination.password ||
        !destination.pathname.startsWith(
            `${base.pathname.replace(/\/$/, '')}/api/`,
        )
    )
        throw invalid();
    return destination.href;
};
export const createAgentConnectionFetch =
    (instanceUrl: string) => (url: string, init: RequestInit) =>
        fetch(agentConnectionApiUrl(instanceUrl, url), init);
