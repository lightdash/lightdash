import { Box, Button, Group, Skeleton, Text } from '@mantine/core';
import {
    IconAlertTriangle,
    IconAppWindow,
    IconCircleCheckFilled,
    IconCircleDashed,
    IconHandStop,
    IconRefresh,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { BUILD_STAGES } from '../utils/buildStage';
import classes from './BuildCards.module.css';

type BuildingProps = {
    /** Index into BUILD_STAGES. */
    stageIndex: number;
};

const BuildStageList: FC<{ stageIndex: number }> = ({ stageIndex }) => (
    <Box component="ol" className={classes.stages} aria-label="Build stages">
        {BUILD_STAGES.map((stage, i) => {
            const state =
                i < stageIndex ? 'done' : i === stageIndex ? 'current' : 'todo';
            return (
                <Box
                    component="li"
                    key={stage}
                    className={classes.stage}
                    data-state={state}
                >
                    <MantineIcon
                        icon={
                            state === 'done'
                                ? IconCircleCheckFilled
                                : IconCircleDashed
                        }
                        size={16}
                        className={classes.stageIcon}
                    />
                    <Text
                        size="sm"
                        fw={state === 'current' ? 500 : 400}
                        span
                        data-shimmer={state === 'current' || undefined}
                    >
                        {stage}
                    </Text>
                </Box>
            );
        })}
    </Box>
);

/** Preview pane while the first version builds: a wireframe of the page. */
export const PreviewBuilding: FC<BuildingProps> = ({ stageIndex }) => (
    <Box className={classes.previewBuilding}>
        <Box className={classes.wireframe}>
            <BuildStageList stageIndex={stageIndex} />
            <Box className={classes.wireframeBody} aria-hidden>
                <Group gap="sm" grow>
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} h={64} radius="md" />
                    ))}
                </Group>
                <Group gap="sm" grow align="stretch">
                    <Skeleton h={180} radius="md" />
                    <Skeleton h={180} radius="md" />
                </Group>
                <Skeleton h={120} radius="md" />
            </Box>
        </Box>
    </Box>
);

export const PreviewBuildingPill: FC<{
    version: number | null;
    showingVersion: number;
}> = ({ version, showingVersion }) => (
    <Box className={classes.previewPill} role="status">
        <Text size="xs" fw={500} span data-shimmer>
            {version === null
                ? 'Building next version'
                : `Building v${version}`}
        </Text>
        <Text size="xs" c="dimmed" span truncate maw={260}>
            · showing v{showingVersion} until it&apos;s ready
        </Text>
    </Box>
);

/** Over an existing preview when the latest prompt's build didn't land. */
export const PreviewNotAppliedPill: FC<{
    version: number;
    stopped: boolean;
}> = ({ version, stopped }) => (
    <Box
        className={classes.previewPill}
        data-tone={stopped ? undefined : 'warning'}
        role="status"
    >
        <MantineIcon
            icon={stopped ? IconHandStop : IconAlertTriangle}
            size={13}
            className={classes.previewPillIcon}
        />
        <Text size="xs" fw={500} span>
            {stopped ? 'Last change stopped' : 'Last change failed'}
        </Text>
        <Text size="xs" span className={classes.previewPillDetail}>
            · still showing v{version}
        </Text>
    </Box>
);

/** Preview pane when nothing was ever built (e.g. the first build failed). */
export const PreviewEmpty: FC<{
    failed: boolean;
    /** Re-runs the failed first prompt; null hides the button. */
    onRetry: (() => void) | null;
    disabled: boolean;
}> = ({ failed, onRetry, disabled }) => (
    <Box className={classes.previewEmptyState}>
        <MantineIcon
            icon={IconAppWindow}
            size={40}
            stroke={1.2}
            className={classes.previewEmptyIcon}
        />
        <Text size="sm" fw={600}>
            {failed ? 'No preview yet' : 'Your app preview will appear here'}
        </Text>
        {failed && (
            <Text
                size="xs"
                ta="center"
                maw={300}
                className={classes.previewEmptyHint}
            >
                The first build didn&apos;t finish, so there is nothing to show.{' '}
                {onRetry ? (
                    <Text span inherit visibleFrom="sm">
                        Retry it from the chat.
                    </Text>
                ) : (
                    'Retry it from the chat, or send a new prompt.'
                )}
            </Text>
        )}
        {failed && onRetry && (
            // Mobile shows one pane at a time, so the preview needs its own Retry.
            <Button
                hiddenFrom="sm"
                mt="xs"
                size="xs"
                variant="default"
                leftSection={<MantineIcon icon={IconRefresh} size={14} />}
                onClick={onRetry}
                disabled={disabled}
            >
                Retry
            </Button>
        )}
    </Box>
);
