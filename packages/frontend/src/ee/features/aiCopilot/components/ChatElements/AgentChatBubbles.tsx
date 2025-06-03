import {
    type AiAgentMessageAssistant,
    type AiAgentMessageUser,
    type AiAgentUser,
    type ApiAiAgentThreadMessageViz,
    assertUnreachable,
} from '@lightdash/common';
import {
    ActionIcon,
    Card,
    CopyButton,
    Group,
    Loader,
    Paper,
    Skeleton,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCopy,
    IconThumbDown,
    IconThumbUp,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import dayjs from 'dayjs';
import EChartsReact, { type EChartsOption } from 'echarts-for-react';
import { type FC } from 'react';
import { useParams } from 'react-router';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import { useAiAgentThreadMessageViz } from '../../hooks/useAiAgents';
import AiTableViz from './AiTableViz';

export const UserBubble: FC<{ message: AiAgentMessageUser<AiAgentUser> }> = ({
    message,
}) => {
    const timeAgo = useTimeAgo(new Date(message.createdAt));
    const name = message.user.name;
    return (
        <Stack gap="sm" style={{ alignSelf: 'flex-end' }}>
            <Stack gap={0} align="flex-end">
                <Text size="sm" c="gray.7" fw={600}>
                    {name}
                </Text>
                <Tooltip
                    label={dayjs(message.createdAt).toString()}
                    withinPortal
                >
                    <Text size="xs" c="dimmed">
                        {timeAgo}
                    </Text>
                </Tooltip>
            </Stack>
            <Card
                pos="relative"
                radius="md"
                py="xs"
                px="sm"
                withBorder={true}
                bg="white"
                color="white"
                style={{
                    overflow: 'unset',
                    borderStartEndRadius: '0px',
                }}
            >
                <MDEditor.Markdown
                    source={message.message}
                    style={{ backgroundColor: 'transparent' }}
                />
            </Card>
        </Stack>
    );
};

type VizQueryData = {
    type: 'time_series_chart' | 'vertical_bar_chart' | 'csv';
    chartOptions?: EChartsOption;
    results?: ApiAiAgentThreadMessageViz['results'];
};

type VizQuery = {
    data?: VizQueryData;
    isLoading: boolean;
    isError: boolean;
};

export const AssistantBubble: FC<{
    message: AiAgentMessageAssistant;
    vizQuery?: VizQuery;
    AiTableViz?: FC<{ results: any }>;
}> = ({ message }) => {
    const { agentUuid } = useParams();
    const { activeProjectUuid } = useActiveProjectUuid();

    const vizQuery = useAiAgentThreadMessageViz(
        {
            agentUuid: agentUuid!,
            threadUuid: message.threadUuid,
            messageUuid: message.uuid,
        },
        {
            enabled:
                !!message.metricQuery &&
                !!message.vizConfigOutput &&
                !!activeProjectUuid,
        },
    );
    const upVoted =
        typeof message.humanScore === 'number' && message.humanScore === 1;
    const downVoted =
        typeof message.humanScore === 'number' && message.humanScore === -1;

    // TODO: Do not use hardcoded string for loading state
    const isLoading = message.message === 'Thinking...';
    return (
        <Stack
            pos="relative"
            py="xs"
            px="sm"
            w="100%"
            gap="xs"
            style={{
                overflow: 'unset',
                borderStartStartRadius: '0px',
            }}
        >
            {isLoading ? (
                <Skeleton h={20} w={100} />
            ) : (
                <MDEditor.Markdown
                    source={message.message}
                    style={{ backgroundColor: 'transparent' }}
                />
            )}

            {message.vizConfigOutput && message.metricQuery && (
                <Paper withBorder radius="sm" p="md" shadow="none">
                    {vizQuery.isLoading ? (
                        <Loader />
                    ) : vizQuery.isError ? (
                        <Text>Error fetching viz</Text>
                    ) : vizQuery.data.type === 'vertical_bar_chart' ? (
                        <EChartsReact option={vizQuery.data.chartOptions} />
                    ) : vizQuery.data.type === 'time_series_chart' ? (
                        <EChartsReact option={vizQuery.data.chartOptions} />
                    ) : vizQuery.data.type === 'csv' ? (
                        <AiTableViz results={vizQuery.data.results} />
                    ) : (
                        assertUnreachable(
                            vizQuery.data.type,
                            'Unknown viz type',
                        )
                    )}
                </Paper>
            )}
            <Group gap={0}>
                <CopyButton value={message.message}>
                    {({ copied, copy }) => (
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="copy"
                            onClick={copy}
                            style={{ display: isLoading ? 'none' : 'block' }}
                        >
                            {copied ? (
                                <IconCheck size={16} />
                            ) : (
                                <IconCopy size={16} />
                            )}
                        </ActionIcon>
                    )}
                </CopyButton>
                {/* TODO: Add up/down vote to Web UI */}
                <Group style={{ display: 'none' }}>
                    <ActionIcon
                        variant="subtle"
                        color={upVoted ? 'green' : 'gray'}
                        aria-label="upvote"
                    >
                        <IconThumbUp size={16} />
                    </ActionIcon>

                    <ActionIcon
                        variant="subtle"
                        color={downVoted ? 'red' : 'gray'}
                        aria-label="downvote"
                    >
                        <IconThumbDown size={16} />
                    </ActionIcon>
                </Group>
            </Group>
        </Stack>
    );
};
