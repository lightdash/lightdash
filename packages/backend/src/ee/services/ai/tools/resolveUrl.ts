import { resolveUrlToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { ResolveUrlFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    resolveUrl: ResolveUrlFn;
};

const toolDefinition = resolveUrlToolDefinition.for('agent');

export const getResolveUrl = ({ resolveUrl }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ url }) => {
            try {
                const resolved = await resolveUrl({ url });

                return {
                    result: resolved.isShareLink
                        ? `The share link expands to: ${resolved.url}\nRead the identifiers (project uuid, chart or dashboard uuid, explore name) from this URL and use other tools to fetch the content.`
                        : `"${url}" is not a share link — read its identifiers directly from the URL path; no resolution is needed.`,
                    metadata: {
                        status: 'success' as const,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error resolving URL "${url}"`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
