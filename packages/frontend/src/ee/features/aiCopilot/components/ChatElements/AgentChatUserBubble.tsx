import { type AiAgentMessageUser, type AiAgentUser } from '@lightdash/common';
import { Card, Stack, Text, Tooltip } from '@mantine-8/core';
import MDEditor from '@uiw/react-md-editor';
import { format, parseISO } from 'date-fns';
import { type FC } from 'react';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import useApp from '../../../../../providers/App/useApp';

export const UserBubble: FC<{ message: AiAgentMessageUser<AiAgentUser> }> = ({
    message,
}) => {
    const timeAgo = useTimeAgo(message.createdAt);
    const name = message.user.name;
    const app = useApp();
    const showUserName = app.user?.data?.userUuid !== message.user.uuid;

    return (
        <Stack gap="xs" style={{ alignSelf: 'flex-end' }}>
            <Stack gap={0} align="flex-end">
                {showUserName ? (
                    <Text size="sm" c="gray.7" fw={600}>
                        {name}
                    </Text>
                ) : null}
                <Tooltip
                    label={format(parseISO(message.createdAt), 'PPpp')}
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
