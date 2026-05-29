import { Group, Paper, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { LightdashUserAvatar } from '../../../../components/Avatar';

type AgentNamePillProps = {
    name: string;
    imageUrl: string | null;
    // 'pill' for table cells (boxed, scanned once per column);
    // 'inline' for lists (quiet secondary meta, repeated per row).
    variant?: 'pill' | 'inline';
};

export const AgentNamePill: FC<AgentNamePillProps> = ({
    name,
    imageUrl,
    variant = 'pill',
}) => {
    const isPill = variant === 'pill';

    const content = (
        <Group gap="two" wrap="nowrap">
            <LightdashUserAvatar
                size={isPill ? 12 : 14}
                name={name}
                src={imageUrl}
            />
            <Text
                fz={isPill ? 'sm' : 'xs'}
                fw={isPill ? 500 : 400}
                c="ldGray.7"
                truncate
                maw={220}
            >
                {name}
            </Text>
        </Group>
    );

    if (!isPill) {
        return content;
    }

    return (
        <Paper px="xs" maw="100%" display="inline-block">
            {content}
        </Paper>
    );
};
