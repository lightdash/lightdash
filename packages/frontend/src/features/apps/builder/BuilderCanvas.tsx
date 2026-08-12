import { type DataAppVizContext } from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import AppPreview from '../components/AppPreview';
import classes from './BuilderCanvas.module.css';
import BuilderPromptExamples from './BuilderPromptExamples';

type Props = {
    projectUuid: string;
    /** Null while no app exists yet (create flow before the first build). */
    appUuid: string | null;
    /** The version the preview renders; null when nothing is renderable. */
    previewVersion: number | null;
    isBuilding: boolean;
    /** Echoed under the first-build state. */
    buildingPrompt: string | null;
    elapsed: string | null;
    onCancelBuild: (() => void) | null;
    /** Why the latest build failed, when there is nothing renderable. */
    failureMessage: string | null;
    /** Sample data plus configuration from the panel; null renders the app bare. */
    previewContext: DataAppVizContext | null;
    /** The card's configuration column; null until a version declares a schema. */
    configurePanel: ReactNode;
    /** Fills the composer with a starter prompt; null while no composer is
     *  mounted to receive one. */
    onPickExample: ((prompt: string) => void) | null;
};

const CancelBuildLink: FC<{ onCancel: () => void }> = ({ onCancel }) => (
    <Anchor
        component="button"
        type="button"
        size="xs"
        c="dimmed"
        px="xs"
        onClick={onCancel}
    >
        Cancel
    </Anchor>
);

/**
 * The center of the builder: empty, building, failure, and rendered states.
 * A first build gets a full skeleton; a rebuild keeps the previous version
 * dimmed underneath a pill, with the configuration column beside it staying
 * legible throughout.
 */
const BuilderCanvas: FC<Props> = ({
    projectUuid,
    appUuid,
    previewVersion,
    isBuilding,
    buildingPrompt,
    elapsed,
    onCancelBuild,
    failureMessage,
    previewContext,
    configurePanel,
    onPickExample,
}) => {
    const hasPreview = appUuid !== null && previewVersion !== null;
    const isFirstBuild = isBuilding && !hasPreview;

    return (
        <Box className={classes.canvas}>
            {hasPreview ? (
                <Box className={classes.card}>
                    {configurePanel}
                    <Box className={classes.preview} data-dimmed={isBuilding}>
                        <AppPreview
                            projectUuid={projectUuid}
                            appUuid={appUuid}
                            version={previewVersion}
                            refreshKey={0}
                            dataAppVizContext={previewContext ?? undefined}
                        />
                    </Box>
                </Box>
            ) : isFirstBuild ? (
                <Stack gap={28} align="center">
                    <Box className={classes.skeletonBars} aria-hidden>
                        <Box className={classes.skeletonBar} />
                        <Box className={classes.skeletonBar} />
                        <Box className={classes.skeletonBar} />
                        <Box className={classes.skeletonBar} />
                        <Box className={classes.skeletonBar} />
                        <Box className={classes.skeletonBar} />
                    </Box>
                    <Stack gap={7} align="center">
                        <Text
                            className={classes.buildingLabel}
                            fz="sm"
                            fw={600}
                            c="ldBrandViolet.7"
                        >
                            Building your chart type…
                        </Text>
                        {buildingPrompt && (
                            <Text
                                fz={13}
                                c="ldGray.6"
                                maw={440}
                                ta="center"
                                lh={1.5}
                            >
                                “{buildingPrompt}”
                            </Text>
                        )}
                        {(elapsed || onCancelBuild) && (
                            <Text fz="xs" c="dimmed">
                                {elapsed ?? ''}
                                {elapsed && onCancelBuild ? ' · ' : ''}
                                {onCancelBuild && (
                                    <CancelBuildLink onCancel={onCancelBuild} />
                                )}
                            </Text>
                        )}
                    </Stack>
                </Stack>
            ) : failureMessage !== null ? (
                <Stack gap="xs" align="center" maw={460}>
                    <Text fz={17} fw={600} c="ldGray.8">
                        The build failed
                    </Text>
                    <Text fz="sm" c="ldGray.6" ta="center" lh={1.6}>
                        {failureMessage}
                    </Text>
                    <Text fz="sm" c="ldGray.6" ta="center">
                        Ask for a change below to try again.
                    </Text>
                </Stack>
            ) : (
                <Stack gap={40} align="center">
                    <Stack gap={8} align="center" maw={420}>
                        <Text fz={17} fw={600} c="ldGray.8">
                            Start with a prompt
                        </Text>
                        <Text fz="sm" c="ldGray.6" ta="center" lh={1.6}>
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

            {isBuilding && hasPreview && (
                <Box className={classes.overlay}>
                    <Box className={classes.buildingPill}>
                        <Text span inherit>
                            Building…
                            {elapsed ? ` ${elapsed}` : ''}
                        </Text>
                        {onCancelBuild && (
                            <CancelBuildLink onCancel={onCancelBuild} />
                        )}
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default BuilderCanvas;
