import { type DataAppVizContext } from '@lightdash/common';
import { Box } from '@mantine/core';
import { useId, type FC } from 'react';
import { type SdkUpgradeOffer } from '../../../features/apps/hooks/useSdkUpgradeStatus';
import ChartTypeBuilderWorkspace from '../../../features/chartTypes/builder/ChartTypeBuilderWorkspace';
import { type ChartTypeBuilderWorkspaceState } from '../../../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import { deriveAuthoringStatus } from './authoringStatus';
import ExplorerChartTypeAuthoringHeader from './ExplorerChartTypeAuthoringHeader';
import classes from './ExplorerChartTypeAuthoringView.module.css';

type Props = {
    projectUuid: string;
    app: { appUuid: string; name: string; description: string } | null;
    upgrade: (SdkUpgradeOffer & { disabled: boolean }) | null;
    workspace: ChartTypeBuilderWorkspaceState;
    previewContext: DataAppVizContext | null;
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
            <ExplorerChartTypeAuthoringHeader
                projectUuid={projectUuid}
                titleId={titleId}
                app={app}
                status={deriveAuthoringStatus(workspace)}
                upgrade={upgrade}
                hasHistory={workspace.hasHistory}
                isHistoryOpen={workspace.isHistoryOpen}
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
    );
};

export default ExplorerChartTypeAuthoringView;
