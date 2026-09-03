import { type DataAppVizContext } from '@lightdash/common';
import { Box } from '@mantine/core';
import { useId, type FC, type ReactNode } from 'react';
import { type SdkUpgradeOffer } from '../../../features/apps/hooks/useSdkUpgradeStatus';
import { type ChartTypeAppMeta } from '../../../features/chartTypes/builder/appMeta';
import ChartTypeBuilderWorkspace from '../../../features/chartTypes/builder/ChartTypeBuilderWorkspace';
import { type ChartTypeBuilderWorkspaceState } from '../../../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import { ChartGalleryContext } from '../../common/ChartGallery/ChartGalleryContext';
import { ConfigTabs as DataAppVizConfigTabs } from '../../VisualizationConfigs/DataAppVizConfig/DataAppVizConfigTabs';
import { deriveAuthoringStatus } from './authoringStatus';
import ExplorerChartTypeAuthoringHeader from './ExplorerChartTypeAuthoringHeader';
import classes from './ExplorerChartTypeAuthoringView.module.css';

type Props = {
    projectUuid: string;
    app: ChartTypeAppMeta | null;
    upgrade: (SdkUpgradeOffer & { disabled: boolean }) | null;
    workspace: ChartTypeBuilderWorkspaceState;
    previewContext: DataAppVizContext | null;
    /** The host's results-staleness warning; renders nothing while clean. */
    warning: ReactNode;
    onDetailsSaved: () => void;
    onDone: () => void;
};

/** The Author step as it looks; the container decides what it does. */
const ExplorerChartTypeAuthoringView: FC<Props> = ({
    projectUuid,
    app,
    upgrade,
    workspace,
    previewContext,
    warning,
    onDetailsSaved,
    onDone,
}) => {
    const titleId = useId();
    return (
        <Box
            component="section"
            className={classes.root}
            aria-labelledby={titleId}
            data-testid="chart-type-authoring"
        >
            <Box className={classes.builderColumn}>
                <ExplorerChartTypeAuthoringHeader
                    projectUuid={projectUuid}
                    titleId={titleId}
                    app={app}
                    status={deriveAuthoringStatus(workspace)}
                    upgrade={upgrade}
                    hasHistory={workspace.hasHistory}
                    isHistoryOpen={workspace.isHistoryOpen}
                    warning={warning}
                    onToggleHistory={workspace.toggleHistory}
                    onUpgradeStarted={workspace.openHistory}
                    onDetailsSaved={onDetailsSaved}
                    onDone={onDone}
                />
                <ChartTypeBuilderWorkspace
                    projectUuid={projectUuid}
                    workspace={workspace}
                    previewContext={previewContext}
                    syncPreviewUrlState={false}
                    configurePanel={null}
                />
            </Box>
            {/* The chart's real configuration (field mapping + generated
                options); the gallery context hides the type picker inside. */}
            <Box
                component="aside"
                className={classes.configColumn}
                aria-label="Chart type configuration"
            >
                <ChartGalleryContext.Provider value={true}>
                    <DataAppVizConfigTabs />
                </ChartGalleryContext.Provider>
            </Box>
        </Box>
    );
};

export default ExplorerChartTypeAuthoringView;
