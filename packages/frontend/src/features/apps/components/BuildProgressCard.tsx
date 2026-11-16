import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { BUILD_STAGES, getBuildStageLabel } from '../utils/buildStage';
import { groupBuildSteps } from '../utils/groupBuildSteps';
import { type AppVersionNarrationData } from '../utils/versionNarration';
import classes from './BuildCards.module.css';
import BuildSteps from './BuildSteps';

type Props = {
    /** Null until the server has assigned the version number. */
    version: number | null;
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
    narration,
    statusMessage,
    stageIndex,
    showStage,
}) => {
    const [open, setOpen] = useState(false);
    const steps = statusMessage
        ? [...narration.activity, statusMessage]
        : narration.activity;
    const hasSteps = steps.length > 0 || narration.reasoning.length > 0;
    // Folded, only the step running now shows, as in agent replies.
    const rowCount =
        groupBuildSteps(steps, true).groups.length +
        (narration.reasoning.length > 0 ? 1 : 0);
    const canExpand = rowCount > 1;

    return (
        <Box className={classes.progressCard}>
            <UnstyledButton
                w="100%"
                className={classes.cardHeader}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                disabled={!canExpand}
            >
                <Group gap={8} wrap="nowrap">
                    <Text
                        size="xs"
                        fw={500}
                        className={classes.activityLabel}
                        data-shimmer
                    >
                        Working
                    </Text>
                    {showStage && stageIndex < BUILD_STAGES.length && (
                        <Text
                            size="xs"
                            truncate
                            miw={0}
                            className={classes.workingStage}
                        >
                            {getBuildStageLabel(
                                stageIndex,
                                version !== null && version > 1,
                            )}
                        </Text>
                    )}
                    {canExpand && (
                        <MantineIcon
                            icon={IconChevronRight}
                            size={11}
                            stroke={1.6}
                            className={classes.activityChevron}
                            data-open={open || undefined}
                        />
                    )}
                </Group>
            </UnstyledButton>
            {hasSteps && (
                <Box className={classes.cardSection}>
                    <BuildSteps
                        steps={steps}
                        reasoning={narration.reasoning}
                        isLive
                        latestOnly={!open}
                    />
                </Box>
            )}
        </Box>
    );
};

export default BuildProgressCard;
