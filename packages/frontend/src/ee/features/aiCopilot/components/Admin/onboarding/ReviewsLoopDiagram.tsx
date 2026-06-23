import { Box, Text } from '@mantine-8/core';
import {
    IconChecks,
    IconChevronRight,
    IconGitMerge,
    IconGitPullRequest,
    IconLayoutColumns,
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
    {
        icon: IconGitPullRequest,
        title: 'Pull request',
        subtitle: 'opens in your repo',
    },
    {
        icon: IconLayoutColumns,
        title: 'Workspace',
        subtitle: 'follow the fix',
    },
    {
        icon: IconChecks,
        title: 'Build and verify',
        subtitle: 'in a preview',
    },
    { icon: IconGitMerge, title: 'Merge', subtitle: 'the fix is live' },
];

/**
 * Walks the fix lifecycle at a glance: Pull request, Workspace, Build and
 * verify, then Merge (the payoff), plus the feedback loop. Used in the
 * first-visit tour's final step.
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
