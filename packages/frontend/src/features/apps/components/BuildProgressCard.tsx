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

/** One line, "Working <current step>", as in agent replies; earlier steps on click. */
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
    const { groups, currentIndex } = groupBuildSteps(steps, true);
    const current = currentIndex === null ? null : groups[currentIndex];
    const earlierCount =
        groups.length -
        (current && current.targets.length <= 1 ? 1 : 0) +
        (narration.reasoning.length > 0 ? 1 : 0);
    const canExpand = earlierCount > 0;
    const stageLabel =
        showStage && stageIndex < BUILD_STAGES.length
            ? getBuildStageLabel(stageIndex, version !== null && version > 1)
            : null;

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
                    {(current?.label ?? stageLabel) && (
                        <Text
                            size="xs"
                            truncate
                            className={classes.workingStage}
                        >
                            {current?.label ?? stageLabel}
                        </Text>
                    )}
                    {current && current.targets.length > 0 && (
                        <Text
                            size="xs"
                            truncate
                            miw={0}
                            className={classes.stepTarget}
                        >
                            {current.targets[current.targets.length - 1]}
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
            {open && canExpand && (
                <Box className={classes.cardSection}>
                    <BuildSteps
                        steps={steps}
                        reasoning={narration.reasoning}
                        isLive
                        omitCurrent
                    />
                </Box>
            )}
        </Box>
    );
};

export default BuildProgressCard;
