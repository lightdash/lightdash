import { Box, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { useElapsedMs } from '../hooks/useElapsedMs';
import { BUILD_STAGES, getBuildStageLabel } from '../utils/buildStage';
import { type AppVersionNarrationData } from '../utils/versionNarration';
import classes from './BuildCards.module.css';
import BuildSteps from './BuildSteps';
import { formatElapsed } from './buildStepUtils';

type Props = {
    /** Null until the server has assigned the version number. */
    version: number | null;
    startedAt: Date | null;
    narration: AppVersionNarrationData;
    /** Server status line for non-generating stages (e.g. bundling). */
    statusMessage: string | null;
    /** Index into BUILD_STAGES, shared with the preview's stage list. */
    stageIndex: number;
    /** False while the preview already shows the stage stepper. */
    showStage: boolean;
};

const BuildProgressCard: FC<Props> = ({
    version,
    startedAt,
    narration,
    statusMessage,
    stageIndex,
    showStage,
}) => {
    const elapsed = useElapsedMs(startedAt);
    const steps = statusMessage
        ? [...narration.activity, statusMessage]
        : narration.activity;
    const hasSteps = steps.length > 0 || narration.reasoning.length > 0;

    return (
        <Box className={classes.progressCard} data-live="true">
            <Group gap={8} wrap="nowrap" className={classes.cardHeader}>
                {/* The current step carries the live sweep once there is one. */}
                <Text
                    size="xs"
                    fw={500}
                    className={classes.activityLabel}
                    data-shimmer={!hasSteps || undefined}
                >
                    {startedAt
                        ? `Working for ${formatElapsed(elapsed)}`
                        : 'Working…'}
                </Text>
                {showStage && stageIndex < BUILD_STAGES.length && (
                    <Text
                        size="xs"
                        truncate
                        miw={0}
                        className={classes.buildLogCount}
                    >
                        {getBuildStageLabel(
                            stageIndex,
                            version !== null && version > 1,
                        )}
                    </Text>
                )}
            </Group>
            {hasSteps && (
                <Box className={classes.cardSection}>
                    <BuildSteps
                        steps={steps}
                        reasoning={narration.reasoning}
                        isLive
                    />
                </Box>
            )}
        </Box>
    );
};

export default BuildProgressCard;
