import { Anchor, rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ToolCallChip } from '../ToolCallChip';

type Props = {
    name: string | null;
    href: string | null;
};

export const ScheduledDeliveryToolCallDescription: FC<Props> = ({
    name,
    href,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.createdScheduledDelivery')}
            {name ? <ToolCallChip mx={rem(2)}>{name}</ToolCallChip> : null}
            {href ? (
                <>
                    {' — '}
                    <Anchor component={Link} to={href} size="xs">
                        {t('toolDescriptions.viewDelivery')}
                    </Anchor>
                </>
            ) : null}
        </Text>
    );
};
