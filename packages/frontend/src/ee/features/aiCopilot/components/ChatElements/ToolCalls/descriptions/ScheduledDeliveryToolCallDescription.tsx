import { Anchor, rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { Link } from 'react-router';
import { ToolCallChip } from '../ToolCallChip';

type Props = {
    name: string | null;
    href: string | null;
};

export const ScheduledDeliveryToolCallDescription: FC<Props> = ({
    name,
    href,
}) => (
    <Text c="dimmed" size="xs">
        Created scheduled delivery
        {name ? <ToolCallChip mx={rem(2)}>{name}</ToolCallChip> : null}
        {href ? (
            <>
                {' — '}
                <Anchor component={Link} to={href} size="xs">
                    view delivery
                </Anchor>
            </>
        ) : null}
    </Text>
);
