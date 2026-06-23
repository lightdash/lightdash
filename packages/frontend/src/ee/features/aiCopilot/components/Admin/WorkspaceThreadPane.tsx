import {
    type AiPromptContextInput,
    type AiPromptContextItem,
} from '@lightdash/common';
import { Center, Loader } from '@mantine-8/core';
import { useCallback, useMemo, type FC } from 'react';
import { useAiAgentSqlModeAvailable } from '../../hooks/useAiAgentSqlModeAvailable';
import { usePendingThreadRefetch } from '../../hooks/usePendingThreadRefetch';
import {
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../hooks/useProjectAiAgents';
import {
    selectThreadSqlModeRaw,
    setThreadSqlMode,
} from '../../store/aiAgentThreadModeSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../ChatElements/AgentChatInput';
import { contextItemsToContentMentionSuggestions } from '../ChatElements/contentMentions';

type SubmitArgs = {
    message: string;
    toolHints: string[];
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContextItem[];
};

type Props = {
    projectUuid: string;
    agentUuid: string;
    agentName: string;
    threadUuid: string;
    /** Build-fix pane gets a live input; the Test-fix verdict pane is read-only. */
    interactive: boolean;
    placeholder?: string;
};

export const WorkspaceThreadPane: FC<Props> = ({
    projectUuid,
    agentUuid,
    agentName,
    threadUuid,
    interactive,
    placeholder,
}) => {
    const {
        data: thread,
        isLoading,
        refetch,
    } = useAiAgentThread(projectUuid, agentUuid, threadUuid);

    const { isStreaming, isPending } = usePendingThreadRefetch(
        thread,
        threadUuid,
        refetch,
    );

    const dispatch = useAiAgentStoreDispatch();
    const sqlModeAvailable = useAiAgentSqlModeAvailable(projectUuid);
    // Build-fix threads exist to edit the dbt project with SQL introspection,
    // so SQL mode defaults on here (unlike normal chat) until the user toggles
    // it. `raw === undefined` means no stored toggle yet.
    const rawSqlMode = useAiAgentStoreSelector(
        selectThreadSqlModeRaw(threadUuid),
    );
    const sqlMode = rawSqlMode ?? true;

    const { mutateAsync: createMessage, isLoading: isCreating } =
        useCreateAgentThreadMessageMutation(
            projectUuid,
            agentUuid,
            threadUuid,
            {},
        );

    const contentMentionItems = useMemo(
        () =>
            contextItemsToContentMentionSuggestions(
                thread?.messages.flatMap((message) =>
                    message.role === 'user' ? message.context : [],
                ) ?? [],
                'thread',
            ),
        [thread?.messages],
    );

    const handleSubmit = useCallback(
        ({ message, toolHints, context, optimisticContext }: SubmitArgs) => {
            const firstAssistant = thread?.messages?.find(
                (m) => m.role === 'assistant',
            );
            // Continue PR turns are frictionless: SQL runs auto-approved and the
            // writeback tool is pinned so a follow-up reliably updates the PR.
            void createMessage({
                prompt: message,
                modelConfig: firstAssistant?.modelConfig ?? undefined,
                context,
                optimisticContext,
                enableSqlMode: sqlMode,
                autoApproveSql: true,
                toolHints: toolHints.includes('editDbtProject')
                    ? toolHints
                    : ['editDbtProject', ...toolHints],
            });
        },
        [createMessage, thread?.messages, sqlMode],
    );

    if (isLoading || !thread) {
        return (
            <Center mt="xl">
                <Loader size="sm" color="gray" />
            </Center>
        );
    }

    return (
        <AgentChatDisplay
            thread={thread}
            agentName={agentName}
            enableAutoScroll
            projectUuid={projectUuid}
            agentUuid={agentUuid}
            renderArtifactsInline
        >
            {interactive ? (
                <AgentChatInput
                    loading={isCreating || isStreaming || isPending}
                    onSubmit={handleSubmit}
                    placeholder={
                        placeholder ?? `Ask ${agentName} to refine the PR…`
                    }
                    messageCount={thread.messages?.length || 0}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    fullWidth
                    showSuggestions={false}
                    threadUuid={threadUuid}
                    sqlMode={sqlModeAvailable ? sqlMode : undefined}
                    onSqlModeChange={
                        sqlModeAvailable
                            ? (enabled) =>
                                  dispatch(
                                      setThreadSqlMode({ threadUuid, enabled }),
                                  )
                            : undefined
                    }
                    contentMentionPriorityItems={contentMentionItems}
                    latestAssistantMessageUuid={
                        [...(thread.messages ?? [])]
                            .reverse()
                            .find((m) => m.role === 'assistant')?.uuid
                    }
                />
            ) : undefined}
        </AgentChatDisplay>
    );
};
