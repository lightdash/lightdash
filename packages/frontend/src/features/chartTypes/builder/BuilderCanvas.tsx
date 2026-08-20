import {
    ECHARTS_DEFAULT_COLORS,
    type DataAppVizContext,
} from '@lightdash/common';
import { Box, Stack, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useResolvedColorPalette } from '../../../hooks/appearance/useResolvedColorPalette';
import AppPreview from '../../apps/components/AppPreview';
import { type SdkManifest } from '../../apps/hooks/useAppSdkBridge';
import classes from './BuilderCanvas.module.css';
import BuilderPromptExamples from './BuilderPromptExamples';

type Props = {
    projectUuid: string;
    /** Null while no app exists yet (create flow before the first build). */
    appUuid: string | null;
    /** The version the preview renders; null when nothing is renderable. */
    previewVersion: number | null;
    isBuilding: boolean;
    /** Why the latest build failed, when there is nothing renderable. */
    failureMessage: string | null;
    /** A round is waiting or on screen, so the starter prompts recede. */
    isClarifyRoundOpen: boolean;
    /** The running build skipped clarifying: the clarifier was unreachable. */
    clarifierUnavailable: boolean;
    /** Sample data plus configuration from the panel; null renders the app bare. */
    previewContext: DataAppVizContext | null;
    /** The card's configuration column; null until a version declares a schema. */
    configurePanel: ReactNode;
    /** Fills the composer with a starter prompt; null while no composer is
     *  mounted to receive one. */
    onPickExample: ((prompt: string) => void) | null;
    onSdkManifest: (manifest: SdkManifest) => void;
};

/** Same footprint and viewBox as an example card's thumbnail, so the canvas
 *  keeps one drawing scale from starter prompts through to the build. */
const SKELETON_BARS = [
    { x: 8, y: 34, height: 26 },
    { x: 34, y: 16, height: 44 },
    { x: 60, y: 25, height: 35 },
    { x: 86, y: 2, height: 58 },
    { x: 112, y: 19, height: 41 },
    { x: 138, y: 10, height: 50 },
];

/** The pending chart, drawn in the project's own color. One color at shifting
 *  intensity rather than the whole palette: a placeholder, not a stand-in
 *  chart with series of its own. */
const SkeletonBars: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const palette = useResolvedColorPalette(projectUuid);
    const color = (palette.length > 0 ? palette : ECHARTS_DEFAULT_COLORS)[0];

    return (
        <svg viewBox="0 0 160 64" className={classes.skeleton} aria-hidden>
            {SKELETON_BARS.map((bar) => (
                <rect
                    key={bar.x}
                    {...bar}
                    width="20"
                    rx="3"
                    fill={color}
                    className={classes.skeletonBar}
                />
            ))}
        </svg>
    );
};

/**
 * The center of the builder: empty, building, failure, and rendered states.
 * A first build gets a full skeleton; a rebuild keeps the previous version
 * legible underneath — chart and options together, dimmed and inert, since
 * both belong to the version being replaced. Live status stays in the composer.
 */
const BuilderCanvas: FC<Props> = ({
    projectUuid,
    appUuid,
    previewVersion,
    isBuilding,
    failureMessage,
    isClarifyRoundOpen,
    clarifierUnavailable,
    previewContext,
    configurePanel,
    onPickExample,
    onSdkManifest,
}) => {
    const hasPreview = appUuid !== null && previewVersion !== null;
    const isFirstBuild = isBuilding && !hasPreview;

    return (
        <Box className={classes.canvas}>
            {hasPreview ? (
                <Box
                    className={classes.card}
                    data-dimmed={isBuilding}
                    inert={isBuilding}
                >
                    {configurePanel}
                    <Box className={classes.preview}>
                        <AppPreview
                            projectUuid={projectUuid}
                            appUuid={appUuid}
                            version={previewVersion}
                            refreshKey={0}
                            dataAppVizContext={previewContext ?? undefined}
                            onSdkManifest={onSdkManifest}
                        />
                    </Box>
                </Box>
            ) : isFirstBuild ? (
                <Stack gap="xl" align="center">
                    <SkeletonBars projectUuid={projectUuid} />
                    <Stack gap={4} align="center">
                        <Text size="md" fw={600} c="ldGray.8">
                            Building your chart type…
                        </Text>
                        {clarifierUnavailable && (
                            <Text fz="xs" c="dimmed" ta="center" maw={340}>
                                Couldn’t reach the clarifier, so this is
                                building from your prompt as written.
                            </Text>
                        )}
                    </Stack>
                </Stack>
            ) : failureMessage !== null ? (
                <Stack gap="xs" align="center">
                    <Text size="md" fw={600} c="ldGray.8">
                        The build failed
                    </Text>
                    <Text fz="xs" c="dimmed" maw={400} ta="center" lh={1.5}>
                        {failureMessage}
                    </Text>
                    <Text fz="xs" c="dimmed" ta="center">
                        Ask for a change below to try again.
                    </Text>
                </Stack>
            ) : (
                <Stack
                    gap="xl"
                    align="center"
                    className={isClarifyRoundOpen ? classes.quiet : undefined}
                    inert={isClarifyRoundOpen}
                >
                    <Stack gap="xs" align="center">
                        <Text size="md" fw={600} c="ldGray.8">
                            Start with a prompt
                        </Text>
                        <Text fz="xs" c="dimmed" maw={400} ta="center" lh={1.5}>
                            Describe the chart type you need. Iterate from
                            there.
                        </Text>
                    </Stack>
                    {onPickExample && (
                        <BuilderPromptExamples
                            projectUuid={projectUuid}
                            onPick={onPickExample}
                        />
                    )}
                </Stack>
            )}
        </Box>
    );
};

export default BuilderCanvas;
