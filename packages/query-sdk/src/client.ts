/**
 * Lightdash client.
 *
 * Usage:
 *   const lightdash = createClient()  // auto-detects from environment
 */

import { createApiTransport } from './apiTransport';
import { createPostMessageTransport } from './postMessageTransport';
import { QueryBuilder } from './query';
import type { LightdashClientConfig, LightdashUser, Transport } from './types';

export class LightdashClient {
    readonly config: LightdashClientConfig;
    readonly transport: Transport;
    readonly auth: { getUser: () => Promise<LightdashUser> };

    constructor(config: LightdashClientConfig, transport: Transport) {
        this.config = config;
        this.transport = transport;
        this.auth = {
            getUser: () => this.transport.getUser(),
        };
    }

    /** Start building a query against a model */
    model(exploreName: string): QueryBuilder {
        return new QueryBuilder(exploreName);
    }
}

/**
 * Resolve config from env vars.
 *
 * Vite (.env file, statically replaced at build time):
 *   VITE_LIGHTDASH_API_KEY, VITE_LIGHTDASH_URL, VITE_LIGHTDASH_PROJECT_UUID
 *
 * Node/E2B (runtime):
 *   LIGHTDASH_API_KEY, LIGHTDASH_URL, LIGHTDASH_PROJECT_UUID
 */
function configFromEnv(): LightdashClientConfig | null {
    // Vite statically replaces import.meta.env.VITE_X at build time.
    // These must be written out in full -- dynamic access won't work.
    const apiKey =
        import.meta.env?.VITE_LIGHTDASH_API_KEY ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).process?.env?.LIGHTDASH_API_KEY;

    const baseUrl =
        import.meta.env?.VITE_LIGHTDASH_URL ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).process?.env?.LIGHTDASH_URL;

    const projectUuid =
        import.meta.env?.VITE_LIGHTDASH_PROJECT_UUID ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).process?.env?.LIGHTDASH_PROJECT_UUID;

    if (!apiKey || !baseUrl || !projectUuid) return null;

    // Auto-enable proxy when running on a different origin (dev server)
    const useProxy =
        typeof window !== 'undefined' &&
        window.location.origin !== new URL(baseUrl).origin;

    return { apiKey, baseUrl, projectUuid, useProxy };
}

/**
 * Create a Lightdash client. Auto-detects the transport from the environment:
 *
 * 1. Hash fragment #transport=postMessage → postMessage bridge (Lightdash iframe)
 * 2. Env vars (VITE_LIGHTDASH_* or LIGHTDASH_*) → direct API calls (local dev)
 */
export function createClient(): LightdashClient {
    // 1. postMessage transport (iframe hosted by Lightdash parent)
    if (typeof window !== 'undefined' && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        if (params.get('transport') === 'postMessage') {
            const projectUuid = params.get('projectUuid') ?? '';
            return new LightdashClient(
                { apiKey: '', baseUrl: '', projectUuid },
                createPostMessageTransport({ targetWindow: window.parent, projectUuid }),
            );
        }
    }

    // 2. Env vars → API transport
    const config = configFromEnv();
    if (!config) {
        throw new Error(
            'Missing Lightdash client config. ' +
                'Set env vars: VITE_LIGHTDASH_API_KEY, VITE_LIGHTDASH_URL, VITE_LIGHTDASH_PROJECT_UUID',
        );
    }
    return new LightdashClient(config, createApiTransport(config));
}
