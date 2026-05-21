import { type AiAgentMessageUser, type AiAgentUser } from '@lightdash/common';
import { Anchor, Card, Group, Stack, Text, Tooltip } from '@mantine-8/core';
import MDEditor from '@uiw/react-md-editor';
import { format, parseISO } from 'date-fns';
import { type FC } from 'react';
import { Link, useParams } from 'react-router';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import useApp from '../../../../../providers/App/useApp';
import { PinnedContextCard } from '../PinnedContextCard/PinnedContextCard';

type Props = {
    message: AiAgentMessageUser<AiAgentUser>;
    isActive?: boolean;
};

export const UserBubble: FC<Props> = ({ message, isActive = false }) => {
    const { projectUuid, agentUuid } = useParams();
    const timeAgo = useTimeAgo(message.createdAt);
    const name = message.user.name;
    const app = useApp();
    const showUserName = app.user?.data?.userUuid !== message.user.uuid;

    return (
        <Stack
            gap={2}
            style={{ alignSelf: 'flex-end' }}
            bg={isActive ? 'ldGray.0' : 'transparent'}
        >
            <Stack gap={0} align="flex-end">
                {showUserName ? (
                    <Text size="sm" c="ldGray.7" fw={600}>
                        {name}
                    </Text>
                ) : null}
                <Tooltip
                    label={format(parseISO(message.createdAt), 'PPpp')}
                    withinPortal
                >
                    <Anchor
                        component={Link}
                        c="dimmed"
                        fz={10}
                        to={`/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${message.threadUuid}/messages/${message.uuid}`}
                    >
                        {timeAgo}
                    </Anchor>
                </Tooltip>
            </Stack>

            {message.context.length > 0 && projectUuid && (
                <Group gap="xs" wrap="wrap" justify="flex-end">
                    {message.context.map((item, idx) => (
                        <PinnedContextCard
                            key={`${item.type}-${
                                item.type === 'chart'
                                    ? item.chartUuid
                                    : item.dashboardUuid
                            }-${idx}`}
                            item={item}
                            projectUuid={projectUuid}
                        />
                    ))}
                </Group>
            )}

            <Card
                pos="relative"
                radius="md"
                py={6}
                px="sm"
                withBorder
                color="white"
                style={{
                    overflow: 'unset',
                    backgroundColor:
                        'color-mix(in srgb, var(--mantine-color-ldGray-1) 45%, transparent)',
                }}
            >
                <MDEditor.Markdown
                    source={message.message}
                    style={{
                        backgroundColor: 'transparent',
                        fontWeight: 500,
                        fontSize: '0.8125rem',
                        color: 'var(--mantine-color-ldGray-8)',
                    }}
                />
            </Card>
        </Stack>
    );
};
