import { type DataAppVizContext } from '@lightdash/common';
import { Box, Transition } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { useRef, useState, type FC, type ReactNode } from 'react';
import { SIDEBAR_ANIMATION_DURATION } from '../../../components/common/Page/constants';
import ResizableSplitter from '../../../components/common/ResizableSplitter';
import { type AppIframePreviewHandle } from '../../apps/AppIframePreview';
import { useElementPicker } from '../../apps/hooks/useElementPicker';
import { refToWireString } from '../../apps/utils/elementRefs';
import { type VizBuildRequest } from '../hooks/useDataAppVizBuild';
import BuilderCanvas from './BuilderCanvas';
import BuilderPromptBar from './BuilderPromptBar';
import classes from './ChartTypeBuilderWorkspace.module.css';
import { type PreviewDataSource } from './previewDataTypes';
import { type ChartTypeBuilderWorkspaceState } from './useChartTypeBuilderWorkspace';
import VersionHistoryPanel from './VersionHistoryPanel';

type Props = {
    projectUuid: string;
    workspace: ChartTypeBuilderWorkspaceState;
    /** What the preview renders with; null renders the app bare. */
    previewContext: DataAppVizContext | null;
    /** What backs `previewContext`; null when the host previews its own rows. */
    previewDataSource: PreviewDataSource | null;
    /** Run status and the strip's own control, beside the source badge. */
    previewSourceExtra: ReactNode | null;
    /** Sits over the chart while the bound data cannot render it. */
    previewOverlay: ReactNode | null;
    /** The composer's data selector; hosts that own no data selection pass
     *  null. */
    dataPill: ReactNode | null;
    /** Bounded sample of the host's current rows, even before a schema exists. */
    sampleRows?: Record<string, string>[];
    currentBuildContext?: VizBuildRequest['context'];
    /** Whether the previewed viz may write its own state into the page URL. */
    syncPreviewUrlState: boolean;
    /** The previewed version's options beside it; null when the host
     *  configures the type elsewhere. */
    configurePanel: ReactNode;
    /** Host-owned configuration kept beside the preview, before history. */
    configurationSidebar?: ReactNode;
};

/**
 * The builder's working area: canvas with the previewed version and its
 * options, the prompt bar, and the version history beside them. Hosts add
 * their own header and decide what the preview renders against.
 */
const ChartTypeBuilderWorkspace: FC<Props> = ({
    projectUuid,
    workspace,
    previewContext,
    previewDataSource,
    previewSourceExtra,
    previewOverlay,
    dataPill,
    sampleRows = [],
    currentBuildContext,
    syncPreviewUrlState,
    configurePanel,
    configurationSidebar,
}) => {
    const {
        dataAppVizUuid,
        build,
        clarification,
        history,
        modelSelection,
        isBuilding,
        buildingPrompt,
        elapsed,
        narration,
        onCancelBuild,
        failureMessage,
        isClarifyRoundOpen,
        previewVersion,
        viewedVersion,
        onViewVersion,
        hasHistory,
        isHistoryOpen,
        closeHistory,
        isPromptBarMounted,
        promptSessionKey,
        composerAppUuid,
        onSdkManifest,
        promptBarRef,
        onPickExample,
    } = workspace;

    const reducedMotion = useReducedMotion();
    const previewRef = useRef<AppIframePreviewHandle>(null);
    const [screenshotAvailable, setScreenshotAvailable] = useState(false);
    const elementPicker = useElementPicker({
        identityKey: `${dataAppVizUuid ?? 'draft'}:${previewVersion ?? 0}`,
        refsIdentityKey: dataAppVizUuid ?? 'draft',
        maxRefs: 5,
    });
    const [isResizingHistory, setIsResizingHistory] = useState(false);
    const showHistory = hasHistory && isHistoryOpen && dataAppVizUuid !== null;
    const latestReadySchema =
        history.versions.find(
            (version) => version.version === history.latestReadyVersion,
        )?.resources?.vizSchema ??
        (viewedVersion === null && !workspace.isFetchingSchema
            ? workspace.dataAppViz?.schema
            : undefined);
    const buildContext =
        currentBuildContext ??
        (latestReadySchema ? { schema: latestReadySchema } : {});

    return (
        <Box
            className={classes.root}
            data-history-open={showHistory || undefined}
            data-history-resizing={isResizingHistory || undefined}
            style={{
                '--history-transition-duration': `${SIDEBAR_ANIMATION_DURATION}ms`,
            }}
        >
            <ResizableSplitter
                handleLabel="Resize version history"
                resizable={showHistory}
                attributes={{
                    handle: { 'aria-hidden': !showHistory || undefined },
                }}
                onResizeStart={() => setIsResizingHistory(true)}
                onResizeEnd={() => setIsResizingHistory(false)}
                classNames={{ handle: classes.historyResizeHandle }}
                orientation="horizontal"
                className={classes.main}
            >
                <ResizableSplitter.Pane
                    id="chart-type-builder-canvas"
                    defaultSize={80}
                    min={50}
                >
                    <Box className={classes.versionSurface}>
                        <Box className={classes.content}>
                            <BuilderCanvas
                                projectUuid={projectUuid}
                                appUuid={dataAppVizUuid}
                                previewVersion={previewVersion}
                                isBuilding={isBuilding}
                                failureMessage={failureMessage}
                                isClarifyRoundOpen={isClarifyRoundOpen}
                                clarifierUnavailable={clarification.fellThrough}
                                previewContext={previewContext}
                                previewDataSource={previewDataSource}
                                previewSourceExtra={previewSourceExtra}
                                previewOverlay={previewOverlay}
                                configurePanel={configurePanel}
                                onPickExample={onPickExample}
                                onSdkManifest={onSdkManifest}
                                syncPreviewUrlState={syncPreviewUrlState}
                                elementPickerProps={elementPicker.iframeProps}
                                previewRef={previewRef}
                                onScreenshotAvailabilityChange={
                                    setScreenshotAvailable
                                }
                            />
                            {isPromptBarMounted && (
                                <BuilderPromptBar
                                    ref={promptBarRef}
                                    sessionKey={promptSessionKey}
                                    projectUuid={projectUuid}
                                    composerAppUuid={composerAppUuid}
                                    hasVersions={history.versions.length > 0}
                                    latestVersion={history.latest}
                                    isNewChart={
                                        dataAppVizUuid === null &&
                                        build.appUuid === null
                                    }
                                    isBuilding={isBuilding}
                                    buildingPrompt={buildingPrompt}
                                    elapsed={elapsed}
                                    latestReadyVersion={
                                        history.latestReadyVersion
                                    }
                                    build={build}
                                    onCancelBuild={onCancelBuild}
                                    narration={narration}
                                    modelSelection={modelSelection}
                                    clarification={clarification}
                                    dataPill={dataPill}
                                    buildContext={{
                                        ...buildContext,
                                        ...(sampleRows.length > 0
                                            ? { sampleRows }
                                            : {}),
                                        ...(elementPicker.refs.length > 0
                                            ? {
                                                  elementReferences:
                                                      elementPicker.refs.map(
                                                          refToWireString,
                                                      ),
                                              }
                                            : {}),
                                    }}
                                    elementPicker={elementPicker}
                                    onCaptureScreenshot={
                                        screenshotAvailable
                                            ? async () => {
                                                  const capture =
                                                      previewRef.current
                                                          ?.captureScreenshot;
                                                  if (!capture) {
                                                      throw new Error(
                                                          'Screenshot capture is not available',
                                                      );
                                                  }
                                                  return capture();
                                              }
                                            : undefined
                                    }
                                />
                            )}
                        </Box>
                        {configurationSidebar && (
                            <Box className={classes.configurationSidebar}>
                                {configurationSidebar}
                            </Box>
                        )}
                    </Box>
                </ResizableSplitter.Pane>
                {hasHistory && dataAppVizUuid !== null && (
                    <ResizableSplitter.Pane
                        id="chart-type-builder-history"
                        className={classes.historyPanel}
                        defaultSize="320px"
                        min="240px"
                        max="360px"
                        inert={!showHistory}
                        aria-hidden={!showHistory || undefined}
                    >
                        <Transition
                            mounted={showHistory}
                            transition={reducedMotion ? 'fade' : 'slide-left'}
                            duration={SIDEBAR_ANIMATION_DURATION}
                        >
                            {(style) => (
                                <Box
                                    className={classes.historyContent}
                                    style={style}
                                >
                                    <VersionHistoryPanel
                                        projectUuid={projectUuid}
                                        appUuid={dataAppVizUuid}
                                        versions={history.versions}
                                        latestReadyVersion={
                                            history.latestReadyVersion
                                        }
                                        viewedVersion={viewedVersion}
                                        onView={onViewVersion}
                                        onClose={closeHistory}
                                        build={build}
                                        hasEarlier={history.hasEarlier}
                                        isFetchingEarlier={
                                            history.isFetchingEarlier
                                        }
                                        fetchEarlier={history.fetchEarlier}
                                        currentThreadNumber={
                                            history.currentThreadNumber
                                        }
                                    />
                                </Box>
                            )}
                        </Transition>
                    </ResizableSplitter.Pane>
                )}
            </ResizableSplitter>
        </Box>
    );
};

export default ChartTypeBuilderWorkspace;
