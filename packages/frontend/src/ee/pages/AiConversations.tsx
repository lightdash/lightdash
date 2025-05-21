import {
    isAiConversationMessageComplete,
    type AiConversation,
    type AiConversationMessage,
} from '@lightdash/common';
import {
    Accordion,
    Avatar,
    Badge,
    Box,
    Card,
    Center,
    Drawer,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { Prism } from '@mantine/prism';
import {
    IconChartHistogram,
    IconCode,
    IconFilter,
    IconMessage,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import MDEditor from '@uiw/react-md-editor';
import dayjs from 'dayjs';
import type { FC } from 'react';
import { Link, useNavigate, useParams, type LinkProps } from 'react-router';
import { lightdashApi } from '../../api';
import MantineIcon from '../../components/common/MantineIcon';
import Page from '../../components/common/Page/Page';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { getNameInitials } from '../../features/comments/utils';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import slackSvg from '../../svgs/slack.svg';

const getAiConversations = async (projectUuid: string) => {
    const data = await lightdashApi<AiConversation[]>({
        url: `/ai/${projectUuid}/conversations`,
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
                ? getAiConversations(projectUuid)
                : Promise.reject();
        },
        enabled: !!projectUuid,
    });
};

const getMessages = async (projectUuid: string, aiThreadUuid: string) => {
    const data = await lightdashApi<AiConversationMessage[]>({
        url: `/ai/${projectUuid}/conversations/${aiThreadUuid}/messages`,
        method: 'GET',
        body: null,
    });

    return data;
};

const useAiMessages = (projectUuid?: string, aiThreadUuid?: string) => {
    return useQuery({
        queryKey: ['ai-messages', projectUuid, aiThreadUuid],
        queryFn: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return projectUuid
                ? getMessages(projectUuid, aiThreadUuid!)
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
                color={actor === 'human' ? 'indigo' : 'gray.0'}
                radius="md"
                variant="filled"
                sx={(theme) => ({
                    ...(actor === 'ai'
                        ? {
                              border: `1px solid ${theme.colors.gray[2]}`,
                          }
                        : {}),
                })}
            >
                {initials}
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
                    // shadow="subtle"
                    radius="sm"
                    py="sm"
                    bg={actor === 'ai' ? 'white' : 'indigo.0'}
                    color={actor === 'ai' ? 'black' : 'white'}
                    withBorder
                    sx={{
                        borderColor: 'gray.0',
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
                            style={{
                                backgroundColor: 'transparent',
                                fontSize: '13px',
                            }}
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
                border: `1px solid ${
                    isActive ? theme.colors.indigo[6] : 'transparent'
                }`,
                backgroundColor: isActive
                    ? theme.colors.indigo[0]
                    : 'transparent',
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                shadow: isActive ? 'sm' : 'none',
                ':hover': isActive
                    ? undefined
                    : {
                          backgroundColor: theme.fn.rgba(
                              theme.colors.gray[2],
                              0.5,
                          ),
                          border: `1px solid ${theme.colors.gray[6]}`,
                      },
            })}
        >
            <Group align="flex-start" noWrap>
                <Box pos="relative">
                    <Avatar color="indigo" radius="md" variant="filled">
                        {getNameInitials(conversation.user.name)}
                    </Avatar>

                    {conversation.createdFrom === 'slack' && (
                        <Avatar
                            size="xs"
                            p={2}
                            src={slackSvg}
                            bg="white"
                            radius="xl"
                            right={0}
                            bottom={0}
                            pos="absolute"
                            shadow="subtle"
                        />
                    )}
                </Box>

                <Stack spacing="xs" w="100%" style={{ overflow: 'hidden' }}>
                    <Group position="apart">
                        <Text fw={600}>{conversation.user.name}</Text>

                        <Tooltip
                            label={dayjs(conversation.createdAt).toString()}
                            withinPortal
                            openDelay={400}
                            variant="xs"
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

    const { data: aiMessages, isFetching: isAiMessagesLoading } = useAiMessages(
        projectUuid,
        threadUuid,
    );

    const selectedConversation = aiConversations?.find(
        (conversation) => conversation.threadUuid === threadUuid,
    );

    const selectedMessage = aiMessages?.find(
        (message) => message.promptUuid === promptUuid,
    );

    const getIconByType = (type: keyof typeof debugDataWithLabels) => {
        switch (type) {
            case 'filtersOutput':
                return IconFilter;
            case 'vizConfigOutput':
                return IconChartHistogram;
            case 'metricQuery':
                return IconCode;
        }
    };

    if (!projectUuid) {
        return null;
    }

    return (
        <Page
            withFullHeight
            backgroundColor="white"
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
                                            ? theme.colors.indigo[6]
                                            : 'transparent'
                                    }`,
                                    backgroundColor: isMessageSelected
                                        ? theme.colors.indigo[0]
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
                                              },
                                })}
                            >
                                <AiThreadMessage
                                    actor="human"
                                    initials={getNameInitials(
                                        message.user.name,
                                    )}
                                    message={message.message}
                                    messagedAt={new Date(message.createdAt)}
                                />

                                {isAiConversationMessageComplete(message) && (
                                    <AiThreadMessage
                                        actor="ai"
                                        initials="🤖"
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
                title={
                    <Group spacing="xs">
                        <Paper withBorder shadow="subtle" p="xs" radius="md">
                            <MantineIcon icon={IconMessage} />
                        </Paper>
                        <Title order={3}>Prompt details</Title>
                    </Group>
                }
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
                        variant="filled"
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
                                    <Accordion.Control
                                        fw={600}
                                        icon={
                                            <MantineIcon
                                                icon={getIconByType(key)}
                                            />
                                        }
                                    >
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
