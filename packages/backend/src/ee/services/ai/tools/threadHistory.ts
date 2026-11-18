import {
    getThreadToolDefinition,
    isAiAppThreadCreatedFrom,
    isSlackPrompt,
    listThreadsToolDefinition,
    searchThreadsToolDefinition,
    type AiWebAppPrompt,
    type SlackPrompt,
} from '@lightdash/common';
import { tool } from 'ai';
import type { AiAgentExecutionConfig } from '../types/aiAgent';
import type {
    GetThreadFn,
    ListThreadsFn,
    SearchThreadsFn,
} from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

/**
 * Thread history is offered where the agent talks to the signed-in person
 * alone: the app, the API and Semantic Studio. On Slack the reply lands in a
 * shared channel, and an embedded agent runs as the embed's shared user, so
 * either would show one person's conversations to others.
 */
export const canOfferThreadHistory = (
    prompt: AiWebAppPrompt | SlackPrompt,
    executionMode: AiAgentExecutionConfig['mode'],
): boolean =>
    !isSlackPrompt(prompt) &&
    (isAiAppThreadCreatedFrom(prompt.threadCreatedFrom) ||
        prompt.threadCreatedFrom === 'semantic_studio') &&
    prompt.threadEmbedSpaceUuid === null &&
    prompt.threadEmbedOwnerIdentifier === null &&
    prompt.externalUserId === null &&
    executionMode === 'standard';

type Output<TStructuredContent> = Promise<
    ExecuteStructuredToolResult<TStructuredContent> | ExecuteToolErrorResult
>;

// The transcript and the lists are bounded by the service, so the model reads
// the same JSON that code mode gets as structured content.
const success = <TStructuredContent>(
    structuredContent: TStructuredContent,
): ExecuteStructuredToolResult<TStructuredContent> => ({
    result: JSON.stringify(structuredContent),
    metadata: { status: 'success' },
    structuredContent,
});

const listThreadsTool = listThreadsToolDefinition.for('agent');

export const getListThreads = ({
    listThreads,
}: {
    listThreads: ListThreadsFn;
}) =>
    tool({
        ...listThreadsTool,
        execute: async (args): Output<Awaited<ReturnType<ListThreadsFn>>> => {
            try {
                return success(await listThreads(args));
            } catch (error) {
                return toolErrorOutput(error, 'Error listing conversations.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

const searchThreadsTool = searchThreadsToolDefinition.for('agent');

export const getSearchThreads = ({
    searchThreads,
}: {
    searchThreads: SearchThreadsFn;
}) =>
    tool({
        ...searchThreadsTool,
        execute: async (args): Output<Awaited<ReturnType<SearchThreadsFn>>> => {
            try {
                return success(await searchThreads(args));
            } catch (error) {
                return toolErrorOutput(error, 'Error searching conversations.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

const getThreadTool = getThreadToolDefinition.for('agent');

export const getGetThread = ({ getThread }: { getThread: GetThreadFn }) =>
    tool({
        ...getThreadTool,
        execute: async (args): Output<Awaited<ReturnType<GetThreadFn>>> => {
            try {
                return success(await getThread(args));
            } catch (error) {
                return toolErrorOutput(error, 'Error reading conversation.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
