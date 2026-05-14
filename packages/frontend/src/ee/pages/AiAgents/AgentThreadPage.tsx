import { Center, Loader } from '@mantine-8/core';
import { useOutletContext, useParams } from 'react-router';
import useApp from '../../../providers/App/useApp';
import { AgentChatDisplay } from '../../features/aiCopilot/components/ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentSqlModeAvailable } from '../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable';
import { useAiAgentThreadArtifact } from '../../features/aiCopilot/hooks/useAiAgentThreadArtifact';
import { usePendingThreadRefetch } from '../../features/aiCopilot/hooks/usePendingThreadRefetch';
import {
    useProjectAiAgent as useAiAgent,
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import {
    selectThreadSqlMode,
    setThreadSqlMode,
} from '../../features/aiCopilot/store/aiAgentThreadModeSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../features/aiCopilot/store/hooks';
import { type AgentContext } from './AgentPage';

const AiAgentThreadPage = ({ debug }: { debug?: boolean }) => {
    const { agentUuid, threadUuid, projectUuid, promptUuid } = useParams();
    const { user } = useApp();

    const {
        data: thread,
        isLoading: isLoadingThread,
        refetch,
    } = useAiAgentThread(projectUuid!, agentUuid, threadUuid);

    // Handle artifact selection based on thread changes
    useAiAgentThreadArtifact({
        projectUuid,
        agentUuid,
        threadUuid,
        thread,
    });

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;

    const agentQuery = useAiAgent(projectUuid!, agentUuid!);
    const { agent } = useOutletContext<AgentContext>();

    const canManage = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const {
        mutateAsync: createAgentThreadMessage,
        isLoading: isCreatingMessage,
    } = useCreateAgentThreadMessageMutation(
        projectUuid!,
        agentUuid,
        threadUuid,
    );

    const { isStreaming, isPending } = usePendingThreadRefetch(
        thread,
        threadUuid!,
        refetch,
    );

    const sqlModeAvailable = useAiAgentSqlModeAvailable(projectUuid);
    const sqlMode = useAiAgentStoreSelector(
        selectThreadSqlMode(threadUuid ?? ''),
    );
    const dispatch = useAiAgentStoreDispatch();

    const handleSubmit = (prompt: string) => {
        // Use modelConfig from first assistant message for follow-up messages
        const firstAssistantMessage = thread?.messages?.find(
            (m) => m.role === 'assistant',
        );
        const modelConfig = firstAssistantMessage?.modelConfig ?? undefined;

        void createAgentThreadMessage({
            prompt,
            modelConfig,
            enableSqlMode: sqlModeAvailable && sqlMode,
        });
    };

    if (isLoadingThread || !thread || agentQuery.isLoading) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    return (
        <AgentChatDisplay
            thread={thread}
            agentName={agentQuery.data?.name ?? 'AI'}
            enableAutoScroll={true}
            promptUuid={promptUuid}
            debug={debug}
            projectUuid={projectUuid}
            agentUuid={agentUuid}
            showAddToEvalsButton={canManage}
        >
            <AgentChatInput
                disabled={
                    thread.createdFrom === 'slack' || !isThreadFromCurrentUser
                }
                disabledReason="This thread is read-only. To continue the conversation, reply in Slack."
                loading={isCreatingMessage || isStreaming || isPending}
                onSubmit={handleSubmit}
                placeholder={`Ask ${agent.name} anything about your data...`}
                messageCount={thread.messages?.length || 0}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
                sqlMode={sqlModeAvailable ? sqlMode : undefined}
                onSqlModeChange={
                    sqlModeAvailable && threadUuid
                        ? (enabled) =>
                              dispatch(
                                  setThreadSqlMode({
                                      threadUuid,
                                      enabled,
                                  }),
                              )
                        : undefined
                }
            />
        </AgentChatDisplay>
    );
};

export default AiAgentThreadPage;
