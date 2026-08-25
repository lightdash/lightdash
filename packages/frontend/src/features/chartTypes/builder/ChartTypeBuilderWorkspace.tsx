import { type DataAppVizContext } from '@lightdash/common';
import { Box } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import BuilderCanvas from './BuilderCanvas';
import BuilderPromptBar from './BuilderPromptBar';
import classes from './ChartTypeBuilderWorkspace.module.css';
import { type ChartTypeBuilderWorkspaceState } from './useChartTypeBuilderWorkspace';
import VersionHistoryPanel from './VersionHistoryPanel';

type Props = {
    projectUuid: string;
    workspace: ChartTypeBuilderWorkspaceState;
    /** What the preview renders with; null renders the app bare. */
    previewContext: DataAppVizContext | null;
    /** Whether the previewed viz may write its own state into the page URL. */
    syncPreviewUrlState: boolean;
    /** The previewed version's options beside it; null when the host
     *  configures the type elsewhere. */
    configurePanel: ReactNode;
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
    syncPreviewUrlState,
    configurePanel,
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

    return (
        <PanelGroup direction="horizontal" className={classes.main}>
            <Panel id="chart-type-builder-canvas" order={1} minSize={50}>
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
                        configurePanel={configurePanel}
                        onPickExample={onPickExample}
                        onSdkManifest={onSdkManifest}
                        syncPreviewUrlState={syncPreviewUrlState}
                    />
                    {isPromptBarMounted && (
                        <BuilderPromptBar
                            ref={promptBarRef}
                            sessionKey={promptSessionKey}
                            projectUuid={projectUuid}
                            composerAppUuid={composerAppUuid}
                            hasVersions={history.versions.length > 0}
                            isBuilding={isBuilding}
                            buildingPrompt={buildingPrompt}
                            elapsed={elapsed}
                            latestReadyVersion={history.latestReadyVersion}
                            build={build}
                            onCancelBuild={onCancelBuild}
                            narration={narration}
                            modelSelection={modelSelection}
                            clarification={clarification}
                        />
                    )}
                </Box>
            </Panel>
            {hasHistory && isHistoryOpen && dataAppVizUuid !== null && (
                <>
                    <PanelResizeHandle
                        className={classes.historyResizeHandle}
                        aria-label="Resize version history"
                    />
                    <Panel
                        id="chart-type-builder-history"
                        order={2}
                        defaultSize={20}
                        minSize={15}
                        maxSize={50}
                    >
                        <VersionHistoryPanel
                            projectUuid={projectUuid}
                            appUuid={dataAppVizUuid}
                            versions={history.versions}
                            latestReadyVersion={history.latestReadyVersion}
                            viewedVersion={viewedVersion}
                            onView={onViewVersion}
                            onClose={closeHistory}
                            build={build}
                            hasEarlier={history.hasEarlier}
                            isFetchingEarlier={history.isFetchingEarlier}
                            fetchEarlier={history.fetchEarlier}
                        />
                    </Panel>
                </>
            )}
        </PanelGroup>
    );
};

export default ChartTypeBuilderWorkspace;
