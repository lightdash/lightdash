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
import { createPostMessageTransport } from './postMessageTransport';
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
 * Read transport hint and projectUuid from the URL hash fragment.
 * The parent sets: #transport=postMessage&projectUuid=xxx
 */
function getHashParams(): URLSearchParams | null {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return null;
    return new URLSearchParams(hash);
}

/**
 * Create a Lightdash client.
 *
 * Resolution order (first match wins):
 * 1. Explicit config/transport passed as arguments
 * 2. Hash fragment #transport=postMessage → postMessage transport
 * 3. Hash fragment #token=xxx&baseUrl=yyy → API transport
 * 4. Env vars (VITE_LIGHTDASH_* or LIGHTDASH_*) → API transport
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
        const hashParams = getHashParams();

        if (hashParams) {
            // 2. postMessage transport (iframe hosted by Lightdash parent)
            if (hashParams.get('transport') === 'postMessage') {
                const projectUuid = hashParams.get('projectUuid') ?? '';
                const dummyConfig: LightdashClientConfig = {
                    apiKey: '',
                    baseUrl: '',
                    projectUuid,
                };
                return new LightdashClient(
                    dummyConfig,
                    createPostMessageTransport({
                        targetWindow: window.parent,
                    }),
                );
            }

            // 3. Hash fragment with token (E2B sandbox / standalone dev)
            const token = hashParams.get('token');
            const baseUrl = hashParams.get('baseUrl');
            const projectUuid = hashParams.get('projectUuid');
            if (token && baseUrl && projectUuid) {
                return new LightdashClient({ apiKey: token, baseUrl, projectUuid });
            }
        }
    }

    // 4. Explicit config or env vars
    const resolved = config ?? configFromEnv();
    if (!resolved) {
        throw new Error(
            'Missing Lightdash client config. Either pass { apiKey, baseUrl, projectUuid } ' +
                'or set env vars: VITE_LIGHTDASH_API_KEY, VITE_LIGHTDASH_URL, VITE_LIGHTDASH_PROJECT_UUID',
        );
    }
    return new LightdashClient(resolved);
}
