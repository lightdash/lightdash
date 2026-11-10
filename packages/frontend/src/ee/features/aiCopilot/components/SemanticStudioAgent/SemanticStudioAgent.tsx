import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconLayoutSidebarLeftCollapse, IconPlus } from '@tabler/icons-react';
import { useEffect, useEffectEvent, useRef, type FC } from 'react';
import { Provider } from 'react-redux';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentSqlModeAvailable } from '../../hooks/useAiAgentSqlModeAvailable';
import { usePendingThreadRefetch } from '../../hooks/usePendingThreadRefetch';
import {
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
    useCreateAgentThreadMutation,
} from '../../hooks/useProjectAiAgents';
import { store } from '../../store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../streaming/AiAgentThreadStreamAbortControllerContextProvider';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../ChatElements/AgentChatInput';
import classes from './SemanticStudioAgent.module.css';
import {
    useChatOpen,
    useStudioAgent,
    type StoredThread,
} from './useSemanticStudioChat';

type OpenModel = { modelName: string | null; fieldName: string | null };

type AskedPrompt = { prompt: string | null; onPromptTaken: () => void };

type Submitted = {
    message: string;
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContext;
};

const withOpenModel = (
    { modelName, fieldName }: OpenModel,
    { message, context, optimisticContext }: Submitted,
) => {
    const item = modelName
        ? [{ type: 'semantic_model' as const, modelName, fieldName }]
        : [];
    return {
        prompt: message,
        context: [...item, ...(context ?? [])],
        optimisticContext: [...item, ...(optimisticContext ?? [])],
    };
};

const useStartThread = (
    projectUuid: string,
    agent: AiAgentSummary,
    onCreated: (thread: StoredThread) => void,
    openModel: OpenModel,
) => {
    const sqlMode = useAiAgentSqlModeAvailable(projectUuid);
    const { mutateAsync: createThread, isLoading } =
        useCreateAgentThreadMutation(projectUuid, {
            skipNavigation: true,
            onCreated: (thread) =>
                onCreated({
                    threadUuid: thread.uuid,
                    agentUuid: thread.agentUuid,
                }),
        });
    return {
        isLoading,
        start: (submitted: Submitted) =>
            void createThread({
                agentUuid: agent.uuid,
                createdFrom: 'semantic_studio',
                enableSqlMode: sqlMode,
                ...withOpenModel(openModel, submitted),
            }),
    };
};

/** Sends a prompt asked for from outside the chat, once. */
const useAskedPrompt = (
    { prompt, onPromptTaken }: AskedPrompt,
    send: (message: string) => void,
) => {
    const take = useEffectEvent((asked: string) => {
        onPromptTaken();
        send(asked);
    });
    // Strict Mode mounts twice; the ref keeps that from sending twice.
    const taken = useRef(false);
    useEffect(() => {
        if (!prompt) {
            taken.current = false;
            return;
        }
        if (taken.current) return;
        taken.current = true;
        take(prompt);
    }, [prompt]);
};

// Worded for any warehouse: a starter must not assume what the data is about.
const STARTERS = [
    {
        label: "See what's in my warehouse",
        prompt: 'Look through my warehouse and tell me what is worth modelling first.',
    },
    {
        label: 'Model my main table',
        prompt: 'Find the table the rest of my warehouse hangs off and model it.',
    },
    {
        label: 'Suggest my first metrics',
        prompt: 'Look at my data and suggest the first few metrics to define.',
    },
];

const NewThread: FC<
    OpenModel &
        AskedPrompt & {
            projectUuid: string;
            agent: AiAgentSummary;
            onCreated: (thread: StoredThread) => void;
            showStarters: boolean;
        }
> = ({
    projectUuid,
    agent,
    onCreated,
    modelName,
    fieldName,
    prompt,
    onPromptTaken,
    showStarters,
}) => {
    const { start, isLoading } = useStartThread(projectUuid, agent, onCreated, {
        modelName,
        fieldName,
    });
    useAskedPrompt({ prompt, onPromptTaken }, (message) => start({ message }));
    return (
        <>
            <Stack flex={1} justify="center" align="center" px="md">
                <Text fz="xs" c="dimmed" ta="center">
                    Ask for a model, a metric or a join. Changes collect in your
                    draft, and nothing goes live until you apply it.
                </Text>
                {showStarters ? (
                    <Group gap="xs" justify="center">
                        {STARTERS.map(({ label, prompt: starter }) => (
                            <Button
                                key={label}
                                size="xs"
                                variant="default"
                                disabled={isLoading}
                                onClick={() => start({ message: starter })}
                            >
                                {label}
                            </Button>
                        ))}
                    </Group>
                ) : null}
            </Stack>
            <AgentChatInput
                accessCalloutVariant="inline"
                loading={isLoading}
                onSubmit={start}
                placeholder="What should I build or change?"
                projectUuid={projectUuid}
                agentUuid={agent.uuid}
                fullWidth
            />
        </>
    );
};

const ExistingThread: FC<
    OpenModel &
        AskedPrompt & {
            projectUuid: string;
            agent: AiAgentSummary;
            threadUuid: string;
        }
> = ({
    projectUuid,
    agent,
    threadUuid,
    modelName,
    fieldName,
    prompt,
    onPromptTaken,
}) => {
    const sqlMode = useAiAgentSqlModeAvailable(projectUuid);
    const {
        data: thread,
        isLoading,
        refetch,
    } = useAiAgentThread(projectUuid, agent.uuid, threadUuid);
    const { isStreaming, isThreadPending } = usePendingThreadRefetch(
        thread,
        threadUuid,
        refetch,
    );
    const { mutateAsync: sendMessage, isLoading: isSending } =
        useCreateAgentThreadMessageMutation(
            projectUuid,
            agent.uuid,
            threadUuid,
        );
    useAskedPrompt(
        { prompt, onPromptTaken },
        (message) =>
            void sendMessage({
                enableSqlMode: sqlMode,
                ...withOpenModel({ modelName, fieldName }, { message }),
            }),
    );
    if (isLoading || !thread) {
        return (
            <Center flex={1}>
                <Loader size="sm" color="gray" />
            </Center>
        );
    }
    return (
        <AgentChatDisplay
            thread={thread}
            agentName={agent.name}
            enableAutoScroll
            projectUuid={projectUuid}
            agentUuid={agent.uuid}
            renderArtifactsInline
        >
            <AgentChatInput
                accessCalloutVariant="inline"
                loading={isSending || isStreaming || isThreadPending}
                onSubmit={(submitted) =>
                    void sendMessage({
                        enableSqlMode: sqlMode,
                        ...withOpenModel({ modelName, fieldName }, submitted),
                    })
                }
                placeholder="What should I build or change?"
                messageCount={thread.messages.length}
                projectUuid={projectUuid}
                agentUuid={agent.uuid}
                threadUuid={threadUuid}
                fullWidth
            />
        </AgentChatDisplay>
    );
};

type AgentProps = OpenModel &
    AskedPrompt & { projectUuid: string; showStarters: boolean };

const SemanticStudioAgentPanel: FC<AgentProps> = ({
    projectUuid,
    modelName,
    fieldName,
    prompt,
    onPromptTaken,
    showStarters,
}) => {
    const { isEnabled, agent, thread, setStored } = useStudioAgent(projectUuid);
    const [isOpen, setIsOpen] = useChatOpen();

    if (!isEnabled || !agent) return null;
    if (!isOpen) return null;
    return (
        <Box className={classes.panel}>
            <Group className={classes.actions} gap={4} wrap="nowrap">
                {thread ? (
                    <Tooltip label="New conversation">
                        <ActionIcon
                            aria-label="New conversation"
                            onClick={() => setStored(null)}
                        >
                            <MantineIcon icon={IconPlus} />
                        </ActionIcon>
                    </Tooltip>
                ) : null}
                <Tooltip label="Hide chat">
                    <ActionIcon
                        aria-label="Hide chat"
                        onClick={() => setIsOpen(false)}
                    >
                        <MantineIcon icon={IconLayoutSidebarLeftCollapse} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Box className={classes.body}>
                {thread ? (
                    <ExistingThread
                        key={thread.threadUuid}
                        projectUuid={projectUuid}
                        agent={thread.agent}
                        threadUuid={thread.threadUuid}
                        modelName={modelName}
                        fieldName={fieldName}
                        prompt={prompt}
                        onPromptTaken={onPromptTaken}
                    />
                ) : (
                    <NewThread
                        projectUuid={projectUuid}
                        agent={agent}
                        onCreated={setStored}
                        showStarters={showStarters}
                        modelName={modelName}
                        fieldName={fieldName}
                        prompt={prompt}
                        onPromptTaken={onPromptTaken}
                    />
                )}
            </Box>
        </Box>
    );
};

/** The left sidebar of Semantic Studio: an agent that proposes model changes for the person to apply. */
export const SemanticStudioAgent: FC<AgentProps> = (props) => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            <SemanticStudioAgentPanel {...props} />
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);
