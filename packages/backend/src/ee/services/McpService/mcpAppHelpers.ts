/**
 * Helpers for registering MCP App resources and tools.
 *
 * These are local implementations of the helpers from
 * @modelcontextprotocol/ext-apps/server. We implement them directly because
 * the ext-apps package is an ESM-only bundle whose function exports are not
 * resolved correctly by tsx/esbuild at runtime (only re-exported constants
 * survive the dynamic import). The functions are thin wrappers, so inlining
 * them is straightforward and avoids the ESM interop issue entirely.
 */

import { AnyType } from '@lightdash/common';
// eslint-disable-next-line import/extensions
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * MIME type that identifies an MCP App HTML resource.
 */
export const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

/**
 * Legacy metadata key for the resource URI.
 * Kept for backward compatibility with older MCP hosts.
 */
const RESOURCE_URI_META_KEY = 'ui/resourceUri';

/**
 * Register an app resource with the MCP server.
 *
 * Convenience wrapper around `server.registerResource` that defaults the
 * MIME type to {@link RESOURCE_MIME_TYPE}.
 */
export function registerAppResource(
    server: Pick<McpServer, 'registerResource'>,
    name: string,
    uri: string,
    config: { mimeType?: string; description?: string; [key: string]: unknown },
    readCallback: (...args: AnyType[]) => AnyType,
): void {
    server.registerResource(
        name,
        uri,
        { mimeType: RESOURCE_MIME_TYPE, ...config },
        readCallback,
    );
}

/**
 * Register an app tool with the MCP server.
 *
 * Convenience wrapper around `server.registerTool` that normalises UI
 * metadata so both `_meta.ui.resourceUri` and the legacy
 * `_meta["ui/resourceUri"]` key are present for compatibility.
 */
export function registerAppTool(
    server: Pick<McpServer, 'registerTool'>,
    name: string,
    config: {
        description?: string;
        inputSchema?: AnyType;
        _meta?: Record<string, unknown> & {
            ui?: { resourceUri?: string; [k: string]: unknown };
        };
        [key: string]: unknown;
    },

    cb: (...args: AnyType[]) => AnyType,
) {
    let normalizedConfig = config;
    const meta = config._meta;
    if (meta) {
        const ui = meta.ui as
            | { resourceUri?: string; [k: string]: unknown }
            | undefined;
        const legacyUri = meta[RESOURCE_URI_META_KEY] as string | undefined;

        // Ensure both keys are set for compatibility with all MCP hosts
        if (ui?.resourceUri && !legacyUri) {
            normalizedConfig = {
                ...config,
                _meta: {
                    ...meta,
                    [RESOURCE_URI_META_KEY]: ui.resourceUri,
                },
            };
        } else if (legacyUri && !ui?.resourceUri) {
            normalizedConfig = {
                ...config,
                _meta: {
                    ...meta,
                    ui: { ...ui, resourceUri: legacyUri },
                },
            };
        }
    }

    return server.registerTool(name, normalizedConfig, cb);
}
