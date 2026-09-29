import {
    resolveUrlToolDefinition,
    type ToolResolveUrlStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ResolveUrlFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    resolveUrl: ResolveUrlFn;
};

const toolDefinition = resolveUrlToolDefinition.for('agent');

const renderResult = (content: ToolResolveUrlStructuredContent): string =>
    content.isShareLink
        ? `The share link expands to: ${content.resolvedUrl}\nRead the identifiers (project uuid, chart or dashboard uuid, explore name) from this URL and use other tools to fetch the content.`
        : `"${content.url}" is not a share link — read its identifiers directly from the URL path; no resolution is needed.`;

export const getResolveUrl = ({ resolveUrl }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            url,
        }): Promise<
            | ExecuteStructuredToolResult<ToolResolveUrlStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const resolved = await resolveUrl({ url });
                const structuredContent: ToolResolveUrlStructuredContent =
                    resolved.isShareLink
                        ? {
                              url,
                              isShareLink: true,
                              resolvedUrl: resolved.url,
                          }
                        : { url, isShareLink: false };

                return {
                    result: renderResult(structuredContent),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(error, `Error resolving URL "${url}"`);
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
