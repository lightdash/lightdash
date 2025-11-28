import { type AiAgentMessageUser, type AiAgentUser } from '@lightdash/common';
import { Anchor, Card, Stack, Text, Tooltip } from '@mantine-8/core';
import MDEditor from '@uiw/react-md-editor';
import { format, parseISO } from 'date-fns';
import { type FC } from 'react';
import { Link, useParams } from 'react-router';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import useApp from '../../../../../providers/App/useApp';

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
            gap="xs"
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
                        size="xs"
                        c="dimmed"
                        to={`/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${message.threadUuid}/messages/${message.uuid}`}
                    >
                        {timeAgo}
                    </Anchor>
                </Tooltip>
            </Stack>

            <Card
                pos="relative"
                radius="md"
                py="xs"
                px="sm"
                withBorder={true}
                bg="ldGray.0"
                color="white"
                style={{
                    overflow: 'unset',
                }}
            >
                <MDEditor.Markdown
                    source={message.message}
                    style={{
                        backgroundColor: 'transparent',
                        fontWeight: 500,
                        fontSize: `0.9375rem`,
                    }}
                />
            </Card>
        </Stack>
    );
};
