import { Box, Text } from '@mantine-8/core';
import {
    IconBulb,
    IconCheck,
    IconChevronRight,
    IconGitMerge,
    IconRefresh,
    IconReload,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import styles from './ReviewsLoopDiagram.module.css';

type Step = {
    icon: TablerIcon;
    title: string;
    subtitle: string;
};

const STEPS: Step[] = [
    { icon: IconCheck, title: 'Finding', subtitle: 'you say yes' },
    {
        icon: IconGitMerge,
        title: 'Pull request',
        subtitle: 'opens in your repo',
    },
    { icon: IconRefresh, title: 'dbt compile', subtitle: 'your context loads' },
    { icon: IconBulb, title: 'Future answers', subtitle: 'the agent knows it' },
];

/**
 * Explains, at a glance, that accepting a Reviews suggestion teaches the agent:
 * Finding → Pull request → dbt compile → Future answers, plus the feedback loop.
 * Used in the first-visit tour's final step and the project-context help popover.
 */
export const ReviewsLoopDiagram: FC = () => (
    <Box className={styles.diagram}>
        <Box className={styles.rail}>
            {STEPS.map((step, index) => {
                const isLast = index === STEPS.length - 1;
                return (
                    <Box
                        key={step.title}
                        className={
                            isLast
                                ? `${styles.pill} ${styles.primary}`
                                : styles.pill
                        }
                    >
                        <Box className={styles.iconRow}>
                            <Box className={styles.iconBox}>
                                <MantineIcon icon={step.icon} size={14} />
                            </Box>
                        </Box>
                        <Text className={styles.title}>{step.title}</Text>
                        <Text className={styles.subtitle}>{step.subtitle}</Text>
                        {!isLast && (
                            <Box className={styles.chevron}>
                                <MantineIcon
                                    icon={IconChevronRight}
                                    size={9}
                                    stroke={2.5}
                                />
                            </Box>
                        )}
                    </Box>
                );
            })}
        </Box>
        <Box className={styles.loop}>
            <MantineIcon icon={IconReload} size={13} />
            <Text span fz="inherit" c="inherit" fw="inherit">
                The agent picks this up{' '}
                <Text span className={styles.loopMuted} fz="inherit">
                    on its next answer.
                </Text>
            </Text>
        </Box>
    </Box>
);
