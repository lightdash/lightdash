import { Box, Text } from '@mantine/core';
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
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import styles from './ReviewsLoopDiagram.module.css';

type Step = {
    icon: TablerIcon;
    key: string;
};

const STEPS: Step[] = [
    { icon: IconGitPullRequest, key: 'pullRequest' },
    { icon: IconLayoutColumns, key: 'workspace' },
    { icon: IconChecks, key: 'build' },
    { icon: IconGitMerge, key: 'merge' },
];

/**
 * Walks the fix lifecycle at a glance: Pull request, Workspace, Build and
 * verify, then Merge (the payoff), plus the feedback loop. Used in the
 * first-visit tour's final step.
 */
export const ReviewsLoopDiagram: FC = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <Box className={styles.diagram}>
            <Box className={styles.rail}>
                {STEPS.map((step, index) => {
                    const isLast = index === STEPS.length - 1;
                    return (
                        <Box
                            key={step.key}
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
                            <Text className={styles.title}>
                                {t(`onboarding.loop.${step.key}.title`)}
                            </Text>
                            <Text className={styles.subtitle}>
                                {t(`onboarding.loop.${step.key}.subtitle`)}
                            </Text>
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
                <Text span c="inherit" fw="inherit">
                    <Trans
                        t={t}
                        i18nKey="onboarding.loop.feedback"
                        components={{
                            muted: <Text span className={styles.loopMuted} />,
                        }}
                    />
                </Text>
            </Box>
        </Box>
    );
};
