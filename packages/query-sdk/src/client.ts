/**
 * Lightdash client.
 *
 * Usage:
 *   // Auto-configure from env vars (Vite reads .env automatically)
 *   const lightdash = createClient()
 *
 *   // Or explicit config
 *   const lightdash = createClient({
 *     apiKey: 'pat_xxx',
 *     baseUrl: 'https://app.lightdash.cloud',
 *     projectUuid: 'uuid',
 *   })
 */

import { createApiTransport } from './apiTransport';
import { getTokenFromHash } from './hashToken';
import { QueryBuilder } from './query';
import type { LightdashClientConfig, LightdashUser, Transport } from './types';

export class LightdashClient {
    readonly config: LightdashClientConfig;
    readonly transport: Transport;
    readonly auth: { getUser: () => Promise<LightdashUser> };

    constructor(config: LightdashClientConfig, transport?: Transport) {
        this.config = config;
        this.transport = transport ?? createApiTransport(config);
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
 *   VITE_LIGHTDASH_API_KEY=pat_xxx
 *   VITE_LIGHTDASH_URL=https://app.lightdash.cloud
 *   VITE_LIGHTDASH_PROJECT_UUID=uuid
 *
 * Node/E2B (runtime):
 *   LIGHTDASH_API_KEY=pat_xxx
 *   LIGHTDASH_URL=https://app.lightdash.cloud
 *   LIGHTDASH_PROJECT_UUID=uuid
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
 * Build config from hash fragment params.
 *
 * When a PAT is passed via hash (e.g. #token=PAT&projectUuid=UUID&baseUrl=URL),
 * use apiTransport with direct API calls. This is for E2B sandboxes and local dev.
 */
function configFromHash(): LightdashClientConfig | null {
    if (typeof window === 'undefined') return null;

    const token = getTokenFromHash();
    if (!token) return null;

    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);

    const baseUrl = params.get('baseUrl') ?? null;

    const projectUuid =
        params.get('projectUuid') ??
        import.meta.env?.VITE_LIGHTDASH_PROJECT_UUID ??
        null;

    if (!baseUrl || !projectUuid) return null;

    return { apiKey: token, baseUrl, projectUuid };
}

/**
 * Create a Lightdash client.
 *
 * Resolution order (first match wins):
 * 1. Explicit config/transport passed as arguments
 * 2. Hash fragment params (#token=PAT&...) → apiTransport
 * 3. Env vars (VITE_LIGHTDASH_*) → apiTransport (standalone dev)
 */
export function createClient(
    config?: LightdashClientConfig,
    transport?: Transport,
): LightdashClient {
    // 1. Explicit transport
    if (transport) {
        const resolved = config ?? configFromEnv();
        if (!resolved) {
            throw new Error('Missing Lightdash client config.');
        }
        return new LightdashClient(resolved, transport);
    }

    if (!config) {
        // 2. Hash token → direct API calls
        const hashConfig = configFromHash();
        if (hashConfig) {
            return new LightdashClient(hashConfig);
        }
    }

    // 4. Env vars / explicit config
    const resolved = config ?? configFromEnv();
    if (!resolved) {
        throw new Error(
            'Missing Lightdash client config. Either pass { apiKey, baseUrl, projectUuid } ' +
                'or set env vars.',
        );
    }
    return new LightdashClient(resolved);
}
