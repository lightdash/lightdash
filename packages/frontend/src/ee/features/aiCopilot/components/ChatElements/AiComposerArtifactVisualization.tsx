import {
    ChartKind,
    type AllVizChartConfig,
    type ApiError,
} from '@lightdash/common';
import { type FC, type ReactNode } from 'react';
import { getAiAccessRefusal } from '../../../../../features/aiAccess/errors';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import { AiAccessCallout } from './AiAccessCallout';
import { AiArtifactTableVisualization } from './AiArtifactTableVisualization';
import { AiComposerChartVisualization } from './AiComposerChartVisualization';
import { AiComposerResultError } from './AiComposerResultError';

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    /** The displayed node's result in the run; null until the run has one. */
    queryUuid: string | null;
    /** The run itself failed to start, so no node has a result. */
    runError: ApiError | null;
    vizConfig: AllVizChartConfig;
    headerContent: ReactNode;
    flush?: boolean;
};

// A displayed node result drawn as its viz config says: the table or a chart.
export const AiComposerArtifactVisualization: FC<Props> = ({
    projectUuid,
    results,
    queryUuid,
    runError,
    vizConfig,
    headerContent,
    flush = false,
}) => {
    const uiStrings = useUiStrings();
    const error = runError ?? results.error;
    const refusal = getAiAccessRefusal(error?.error);
    if (refusal) {
        return (
            <AiAccessCallout
                projectUuid={projectUuid}
                refusal={refusal}
                variant="inline"
            />
        );
    }

    if (error) {
        return (
            <AiComposerResultError
                headerContent={headerContent}
                message={error.error?.message ?? null}
            />
        );
    }
    const loadingMessage = uiStrings('aiAgent.composer.loadingResult');
    if (vizConfig.type === ChartKind.TABLE) {
        return (
            <AiArtifactTableVisualization
                results={results}
                headerContent={headerContent}
                loadingMessage={loadingMessage}
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
            loadingMessage={loadingMessage}
        />
    );
};
