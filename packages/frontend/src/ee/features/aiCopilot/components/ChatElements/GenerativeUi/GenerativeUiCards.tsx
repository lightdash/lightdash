import {
    isApiError,
    type AiAgentMessageAssistant,
    type ApiAiAgentUiActionRequest,
    type ApiAiAgentUiActionResponse,
    type GenerativeUiActionSubmission,
} from '@lightdash/common';
import { Stack } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, type FC } from 'react';
import { lightdashApi } from '../../../../../../api';
import { getAiAgentApiBase } from '../../../hooks/aiAgentRouting';
import {
    getAiAgentThreadQueryKey,
    useRetryAiAgentThreadMessageMutation,
} from '../../../hooks/useProjectAiAgents';
import { type StreamPart } from '../../../store/aiAgentThreadStreamSlice';
import { getGenerativeUiCalls } from './generativeUiCalls';
import { type GenerativeUiSubmitResult } from './GenerativeUiCard';
import { GenerativeUiToolCard } from './GenerativeUiToolCard';

type GenerativeUiCardsProps = {
    projectUuid: string;
    agentUuid: string;
    message: AiAgentMessageAssistant;
    streamParts: StreamPart[];
    isStreaming: boolean;
    isLastMessage: boolean;
};

const useSendGenerativeUiOutcome = ({
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
}: {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
}) => {
    const { mutate: resume } = useRetryAiAgentThreadMessageMutation();
    const queryClient = useQueryClient();

    return useCallback(
        async (
            toolCallId: string,
            submission: GenerativeUiActionSubmission,
        ): Promise<GenerativeUiSubmitResult> => {
            const refreshThread = () =>
                queryClient.invalidateQueries({
                    queryKey: getAiAgentThreadQueryKey(
                        projectUuid,
                        agentUuid,
                        threadUuid,
                    ),
                });
            const body: ApiAiAgentUiActionRequest = { outcome: submission };
            let outcome: ApiAiAgentUiActionResponse['results'];
            try {
                outcome = await lightdashApi<
                    ApiAiAgentUiActionResponse['results']
                >({
                    url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/threads/${threadUuid}/tool-calls/${toolCallId}/ui-action`,
                    method: 'POST',
                    body: JSON.stringify(body),
                });
            } catch (error) {
                // Resolved or retired by another tab or an earlier submit; the
                // refreshed thread shows what happened.
                if (isApiError(error) && error.error.statusCode === 409) {
                    await refreshThread();
                    return { kind: 'resolvedElsewhere' };
                }
                throw error;
            }
            if (outcome.resume) {
                // Also covers an outcome recorded by an earlier request whose
                // response was lost before the run could resume.
                resume({ projectUuid, agentUuid, threadUuid, messageUuid });
            } else {
                // A run is already on for this prompt: refresh, never start a second.
                await refreshThread();
            }
            return { kind: 'sent' };
        },
        [projectUuid, agentUuid, threadUuid, messageUuid, resume, queryClient],
    );
};

/**
 * The message's generateUi cards. Mounted once per bubble, outside the live
 * and persisted views, so a card keeps its state when a resume starts.
 */
export const GenerativeUiCards: FC<GenerativeUiCardsProps> = ({
    projectUuid,
    agentUuid,
    message,
    streamParts,
    isStreaming,
    isLastMessage,
}) => {
    const send = useSendGenerativeUiOutcome({
        projectUuid,
        agentUuid,
        threadUuid: message.threadUuid,
        messageUuid: message.uuid,
    });
    const calls = getGenerativeUiCalls({
        toolCalls: message.toolCalls,
        toolResults: message.toolResults,
        streamParts,
    });

    if (calls.length === 0) return null;

    return (
        <Stack gap="xs">
            {calls.map((call) => (
                <GenerativeUiToolCard
                    key={call.toolCallId}
                    call={call}
                    projectUuid={projectUuid}
                    isActive={isLastMessage}
                    isWaiting={isStreaming || message.status === 'pending'}
                    onSubmit={(submission) => send(call.toolCallId, submission)}
                />
            ))}
        </Stack>
    );
};
