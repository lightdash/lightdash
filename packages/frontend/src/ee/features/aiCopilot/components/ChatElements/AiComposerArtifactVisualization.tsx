import { ChartKind, type AllVizChartConfig } from '@lightdash/common';
import { type FC, type ReactNode } from 'react';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AiArtifactTableVisualization } from './AiArtifactTableVisualization';
import { AiComposerChartVisualization } from './AiComposerChartVisualization';
import { AiComposerResultsExpired } from './AiComposerResultsExpired';

const LOADING_MESSAGE = 'Loading composer query results...';

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    /** The displayed node's stored result; null when the artifact has none. */
    queryUuid: string | null;
    vizConfig: AllVizChartConfig;
    headerContent: ReactNode;
    flush?: boolean;
};

// A displayed node result drawn as its viz config says: the table or a chart.
export const AiComposerArtifactVisualization: FC<Props> = ({
    projectUuid,
    results,
    queryUuid,
    vizConfig,
    headerContent,
    flush = false,
}) => {
    if (results.error) {
        return <AiComposerResultsExpired headerContent={headerContent} />;
    }
    if (vizConfig.type === ChartKind.TABLE) {
        return (
            <AiArtifactTableVisualization
                results={results}
                headerContent={headerContent}
                loadingMessage={LOADING_MESSAGE}
                flush={flush}
            />
        );
    }
    return (
        <AiComposerChartVisualization
            projectUuid={projectUuid}
            results={results}
            pivotQueryUuid={queryUuid}
            vizConfig={vizConfig}
            headerContent={headerContent}
            loadingMessage={LOADING_MESSAGE}
        />
    );
};
