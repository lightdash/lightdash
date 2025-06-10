import {
    isAiConversationMessageComplete,
    type AiConversation,
    type AiConversationMessage,
} from '@lightdash/common';
import {
    Accordion,
    Avatar,
    Badge,
    Card,
    Center,
    Drawer,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconMessage } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import MDEditor from '@uiw/react-md-editor';
import dayjs from 'dayjs';
import type { FC } from 'react';
import { Link, useNavigate, useParams, type LinkProps } from 'react-router';
import { lightdashApi } from '../../api';
import Page from '../../components/common/Page/Page';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import slackSvg from '../../svgs/slack.svg';

const getAiAgentConversations = async (projectUuid: string) => {
    const data = await lightdashApi<AiConversation[]>({
        url: `/aiAgents/projects/${projectUuid}/conversations`,
        method: 'GET',
        body: null,
    });

    return data;
};

const useAiConversation = (projectUuid?: string) => {
    return useQuery({
        queryKey: ['ai-conversations', projectUuid],
        queryFn: async () => {
            return projectUuid
                ? getAiAgentConversations(projectUuid)
                : Promise.reject();
        },
        enabled: !!projectUuid,
    });
};

const getAiAgentConversationMessages = async (
    projectUuid: string,
    aiThreadUuid: string,
) => {
    const data = await lightdashApi<AiConversationMessage[]>({
        url: `/aiAgents/projects/${projectUuid}/conversations/${aiThreadUuid}/messages`,
        method: 'GET',
        body: null,
    });

    return data;
};

const useAiAgentConversationMessages = (
    projectUuid?: string,
    aiThreadUuid?: string,
) => {
    return useQuery({
        queryKey: ['ai-agent-messages', projectUuid, aiThreadUuid],
        queryFn: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return projectUuid
                ? getAiAgentConversationMessages(projectUuid, aiThreadUuid!)
                : Promise.reject();
        },
        enabled: !!aiThreadUuid && !!projectUuid,
    });
};

type AiThreadMessageProps = {
    actor: 'human' | 'ai';
    initials: string;
    message: string;
    messagedAt: Date;
    humanScore?: number;
};

const FakeLink = (
    props: LinkProps & React.RefAttributes<HTMLAnchorElement>,
): ReturnType<typeof Link> => {
    return <>{props.children}</>;
};

const AiThreadMessage: FC<AiThreadMessageProps> = ({
    actor,
    initials,
    message,
    messagedAt,
    humanScore,
}) => {
    const timeAgo = useTimeAgo(messagedAt);

    return (
        <Group
            maw="70%"
            align="flex-start"
            spacing="sm"
            noWrap
            style={{
                marginLeft: actor === 'human' ? 'auto' : undefined,
                flexDirection: actor === 'human' ? 'row-reverse' : 'row',
            }}
        >
            <Avatar
                color={actor === 'human' ? 'violet' : 'cyan'}
                radius="xl"
                variant="filled"
            >
                {actor === 'human' ? initials[0] : 'AI'}
            </Avatar>
            <Stack
                spacing="xs"
                align={actor === 'human' ? 'flex-end' : 'flex-start'}
            >
                <Tooltip label={dayjs(messagedAt).toString()} withinPortal>
                    <Text size="xs" color="dimmed">
                        {timeAgo}
                    </Text>
                </Tooltip>

                <Card
                    pos="relative"
                    shadow="md"
                    radius="xl"
                    py="sm"
                    px="lg"
                    bg={actor === 'ai' ? 'white' : 'blue.1'}
                    color={actor === 'ai' ? 'black' : 'white'}
                    style={{
                        overflow: 'unset',
                        ...(actor === 'ai'
                            ? { borderStartStartRadius: '0px' }
                            : actor === 'human'
                            ? { borderStartEndRadius: '0px' }
                            : {}),
                    }}
                >
                    {message ? (
                        <MDEditor.Markdown
                            source={message}
                            style={{ backgroundColor: 'transparent' }}
                        />
                    ) : (
                        <Text italic>No response yet</Text>
                    )}

                    {actor === 'ai' && humanScore !== undefined && (
                        <Badge
                            pos="absolute"
                            right={10}
                            bottom={-14}
                            variant="filled"
                            size="lg"
                            fz="lg"
                            bg={
                                humanScore === 1
                                    ? 'green.7'
                                    : humanScore === -1
                                    ? 'red.7'
                                    : undefined
                            }
                        >
                            {humanScore === 1
                                ? '👍'
                                : humanScore === -1
                                ? '👎'
                                : undefined}
                        </Badge>
                    )}
                </Card>
            </Stack>
        </Group>
    );
};

type AiThreadProps = {
    projectUuid: string;
    conversation: AiConversation;
    isActive: boolean;
};

const AiThread: FC<AiThreadProps> = ({
    projectUuid,
    conversation,
    isActive,
}) => {
    const timeAgo = useTimeAgo(new Date(conversation.createdAt));

    return (
        <UnstyledButton
            component={Link}
            to={`/projects/${projectUuid}/ai/conversations/${conversation.threadUuid}`}
            sx={(theme) => ({
                borderRadius: theme.radius.md,
                border: `2px solid ${
                    isActive ? theme.colors.blue[6] : 'transparent'
                }`,
                backgroundColor: isActive
                    ? theme.colors.blue[0]
                    : 'transparent',
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                ':hover': isActive
                    ? undefined
                    : {
                          backgroundColor: theme.fn.rgba(
                              theme.colors.gray[2],
                              0.5,
                          ),
                          border: `2px solid ${theme.colors.gray[6]}`,
                      },
            })}
        >
            <Group align="flex-start" noWrap>
                <div style={{ position: 'relative' }}>
                    <Avatar color="violet" radius="xl" variant="filled">
                        {conversation.user.name[0]}
                    </Avatar>

                    {conversation.createdFrom === 'slack' && (
                        <Avatar
                            size="sm"
                            p={4}
                            src={slackSvg}
                            bg="white"
                            radius="xl"
                            pos="absolute"
                            right={-12}
                            bottom={-12}
                        />
                    )}
                </div>

                <Stack spacing="xs" w="100%" style={{ overflow: 'hidden' }}>
                    <Group position="apart">
                        <Text fw={600}>{conversation.user.name}</Text>

                        <Tooltip
                            label={dayjs(conversation.createdAt).toString()}
                            withinPortal
                        >
                            <Text component="time" color="dimmed" size="sm">
                                {timeAgo}
                            </Text>
                        </Tooltip>
                    </Group>

                    <Text truncate>{conversation.firstMessage}</Text>
                </Stack>
            </Group>
        </UnstyledButton>
    );
};

const debugDataWithLabels = {
    filtersOutput: 'Filters',
    vizConfigOutput: 'Visualization Config',
    metricQuery: 'Metric Query',
} as const;

const debugDataKeys = Object.keys(debugDataWithLabels) as Array<
    keyof typeof debugDataWithLabels
>;

const AiConversationsPage: FC = () => {
    const { projectUuid, promptUuid, threadUuid } = useParams<{
        projectUuid: string;
        threadUuid?: string;
        promptUuid?: string;
    }>();

    const navigate = useNavigate();

    const { data: aiConversations, isLoading: isAiConversationsLoading } =
        useAiConversation(projectUuid);

    const { data: aiMessages, isFetching: isAiMessagesLoading } =
        useAiAgentConversationMessages(projectUuid, threadUuid);

    const selectedConversation = aiConversations?.find(
        (conversation) => conversation.threadUuid === threadUuid,
    );

    const selectedMessage = aiMessages?.find(
        (message) => message.promptUuid === promptUuid,
    );

    if (!projectUuid) {
        return null;
    }

    return (
        <Page
            withFullHeight
            sidebar={
                isAiConversationsLoading || !aiConversations ? (
                    <Center style={{ flexGrow: 1 }}>
                        <Loader color="dark" variant="bars" />
                    </Center>
                ) : (
                    <Stack
                        style={{ flexGrow: 1, overflow: 'auto' }}
                        spacing="xs"
                    >
                        {aiConversations.map((conversation) => (
                            <AiThread
                                key={conversation.threadUuid}
                                projectUuid={projectUuid}
                                conversation={conversation}
                                isActive={
                                    selectedConversation?.threadUuid ===
                                    conversation.threadUuid
                                }
                            />
                        ))}
                    </Stack>
                )
            }
        >
            {!isAiMessagesLoading && !aiMessages ? (
                <Center style={{ flexGrow: 1 }}>
                    <SuboptimalState
                        icon={IconMessage}
                        description="Select a conversation to view it's messages"
                    />
                </Center>
            ) : isAiMessagesLoading || !aiMessages ? (
                <Center style={{ flexGrow: 1 }}>
                    <Loader color="dark" variant="bars" />
                </Center>
            ) : (
                <Stack
                    px="sm"
                    spacing="xs"
                    style={{ flexGrow: 1, overflow: 'auto' }}
                    ref={(ref) => {
                        // scroll to bottom when new conversation is selected
                        if (ref && selectedConversation) {
                            ref.scrollTop = ref.scrollHeight;
                        }
                    }}
                >
                    {aiMessages.map((message) => {
                        const isMessageSelected =
                            selectedMessage?.promptUuid === message.promptUuid;
                        const canMessageBeSelected =
                            isAiConversationMessageComplete(message) &&
                            (!!message.filtersOutput ||
                                !!message.vizConfigOutput ||
                                !!message.metricQuery);

                        return (
                            <UnstyledButton
                                key={message.promptUuid}
                                component={
                                    canMessageBeSelected ? Link : FakeLink
                                }
                                to={`/projects/${projectUuid}/ai/conversations/${threadUuid}/${message.promptUuid}`}
                                sx={(theme) => ({
                                    borderRadius: theme.radius.md,
                                    cursor: canMessageBeSelected
                                        ? 'pointer'
                                        : 'auto',
                                    border: `2px solid ${
                                        isMessageSelected
                                            ? theme.colors.blue[6]
                                            : 'transparent'
                                    }`,
                                    backgroundColor: isMessageSelected
                                        ? theme.colors.blue[0]
                                        : 'transparent',
                                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                    ':hover':
                                        !canMessageBeSelected ||
                                        isMessageSelected
                                            ? undefined
                                            : {
                                                  backgroundColor:
                                                      theme.fn.rgba(
                                                          theme.colors.gray[2],
                                                          0.5,
                                                      ),
                                                  border: `2px solid ${theme.colors.gray[6]}`,
                                              },
                                })}
                            >
                                <AiThreadMessage
                                    actor="human"
                                    initials={message.user.name}
                                    message={message.message}
                                    messagedAt={new Date(message.createdAt)}
                                />

                                {isAiConversationMessageComplete(message) && (
                                    <AiThreadMessage
                                        actor="ai"
                                        initials="AI"
                                        message={message.response}
                                        messagedAt={
                                            new Date(message.respondedAt)
                                        }
                                        humanScore={message.humanScore}
                                    />
                                )}
                            </UnstyledButton>
                        );
                    })}
                </Stack>
            )}

            <Drawer
                title="Response data"
                opened={!!selectedConversation && !!selectedMessage}
                onClose={() => {
                    void navigate(
                        `/projects/${projectUuid}/ai/conversations/${threadUuid}`,
                    );
                }}
                position="right"
                size="40rem"
            >
                {selectedMessage &&
                isAiConversationMessageComplete(selectedMessage) ? (
                    <Accordion
                        variant="contained"
                        defaultValue={
                            debugDataKeys.find(
                                (key) => !!selectedMessage[key],
                            ) ?? undefined
                        }
                    >
                        {debugDataKeys.map((key) => {
                            const title = debugDataWithLabels[key];
                            return selectedMessage[key] ? (
                                <Accordion.Item key={key} value={key}>
                                    <Accordion.Control fw={600}>
                                        {title}
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Prism language="json" withLineNumbers>
                                            {JSON.stringify(
                                                selectedMessage[key],
                                                null,
                                                2,
                                            )}
                                        </Prism>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            ) : undefined;
                        })}
                    </Accordion>
                ) : undefined}
            </Drawer>
        </Page>
    );
};

export default AiConversationsPage;
