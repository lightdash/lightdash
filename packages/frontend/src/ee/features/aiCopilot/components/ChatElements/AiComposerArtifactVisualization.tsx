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
import { AiComposerChartVisualization } from './AiComposerChartVisualization';
import { AiComposerResultError } from './AiComposerResultError';
import { AiComposerResultTable } from './AiComposerResultTable';

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    /** The displayed node's result in the run; null until the run has one. */
    queryUuid: string | null;
    /** The run itself failed to start, so no node has a result. */
    runError: ApiError | null;
    onRerun: () => void;
    vizConfig: AllVizChartConfig;
    headerContent: ReactNode;
};

// A displayed node result drawn as its viz config says: the table or a chart.
export const AiComposerArtifactVisualization: FC<Props> = ({
    projectUuid,
    results,
    queryUuid,
    runError,
    onRerun,
    vizConfig,
    headerContent,
}) => {
    const uiStrings = useUiStrings();
    const error = runError ?? results.error;
    const refusal = getAiAccessRefusal(error?.error);
    if (refusal) {
        return (
            <AiAccessCallout
                projectUuid={projectUuid}
                refusal={refusal}
                onRerun={onRerun}
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
            <AiComposerResultTable
                projectUuid={projectUuid}
                results={results}
                headerContent={headerContent}
                loadingMessage={loadingMessage}
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
