import { Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { useUiString } from '../../../../providers/Embed/useUiStrings';
import shimmerStyles from './shimmer.module.css';
import styles from './TypingDots.module.css';

/** "Working" with a light sweep, the live marker for every agent turn. */
export const WorkingLabel: FC = () => {
    const working = useUiString('aiAgent.activity.working');
    return (
        <Text size="xs" fw={500} flex="none" className={shimmerStyles.shimmer}>
            {working}
        </Text>
    );
};

type TypingDotsProps = {
    /** What the agent is doing right now; null before the first step. */
    activity?: string | null;
};

export const TypingDots: FC<TypingDotsProps> = ({ activity = null }) => {
    const working = useUiString('aiAgent.activity.working');
    return (
        <Group
            gap={8}
            wrap="nowrap"
            className={styles.indicator}
            role="status"
            aria-label={activity ? `${working}: ${activity}` : working}
            data-tour-status={activity ? undefined : 'true'}
        >
            <WorkingLabel />
            {activity && (
                <Text
                    size="xs"
                    truncate
                    className={styles.activity}
                    data-tour-status="true"
                >
                    {activity}
                </Text>
            )}
        </Group>
    );
};
