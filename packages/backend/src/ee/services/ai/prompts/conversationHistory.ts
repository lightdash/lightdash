import {
    AssistantContent,
    CoreAssistantMessage,
    CoreMessage,
    CoreUserMessage,
    TextPart,
} from 'ai';
import { AiAgentModel } from '../../../models/AiAgentModel';
import { serializeData } from '../utils/serializeData';

export const getChatHistoryFromThreadMessages = (
    // TODO: move getThreadMessages to AiAgentModel and improve types
    // also, it should be called through a service method...
    threadMessages: Awaited<
        ReturnType<typeof AiAgentModel.prototype.getThreadMessages>
    >,
) =>
    threadMessages.flatMap<CoreMessage>((message) => {
        const messages: CoreMessage[] = [
            { role: 'user', content: message.prompt } satisfies CoreUserMessage,
        ];

        if (
            !!message.response ||
            !!message.metric_query ||
            !!message.filters_output ||
            !!message.viz_config_output
        ) {
            const assistantMessageParts: AssistantContent = [];

            if (message.metric_query) {
                // TODO: this should be a tool call
                assistantMessageParts.push({
                    type: 'text',
                    text: `Metric Query:
${serializeData(message.metric_query, 'json')}`,
                });
            }

            if (message.filters_output) {
                // TODO: this should be a tool call
                assistantMessageParts.push({
                    type: 'text',
                    text: `Filters Output:
${serializeData(message.filters_output, 'json')}`,
                });
            }

            if (message.viz_config_output) {
                // TODO: this should be a tool call
                assistantMessageParts.push({
                    type: 'text',
                    text: `Viz Config Output:
${serializeData(message.viz_config_output, 'json')}`,
                });
            }

            if (message.response) {
                assistantMessageParts.push({
                    type: 'text',
                    text: message.response,
                } satisfies TextPart);
            }

            messages.push({
                role: 'assistant',
                content: assistantMessageParts,
            } satisfies CoreAssistantMessage);
        }

        if (message.human_score) {
            messages.push({
                role: 'user',
                content:
                    // TODO: we don't have a neutral option, we are storing -1 and 1 at the moment
                    message.human_score > 0
                        ? 'I liked this response'
                        : 'I did not like this response',
            } satisfies CoreUserMessage);
        }

        return messages;
    });
