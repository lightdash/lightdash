import { type ComposerVizKind, type ComposerVizPlan } from '@lightdash/common';
import { type FC, type ReactNode } from 'react';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AiComposerResultsExpired } from './AiComposerResultsExpired';
import { AiVizSwitchedResult } from './AiVizSwitchedResult';

const LOADING_MESSAGE = 'Loading composer query results...';

type ContentProps = {
    projectUuid: string;
    results: InfiniteQueryResults;
    /** The displayed node's stored result; null when the artifact has none. */
    queryUuid: string | null;
    plan: ComposerVizPlan;
    kind: ComposerVizKind;
    onKindChange: (kind: ComposerVizKind) => void;
    headerContent: ReactNode;
    flush?: boolean;
};

// A displayed node result with its viz switcher.
export const AiComposerArtifactVisualization: FC<ContentProps> = ({
    projectUuid,
    results,
    queryUuid,
    plan,
    kind,
    onKindChange,
    headerContent,
    flush = false,
}) => {
    if (results.error) {
        return <AiComposerResultsExpired headerContent={headerContent} />;
    }

    return (
        <AiVizSwitchedResult
            projectUuid={projectUuid}
            results={results}
            seriesSplitQueryUuid={queryUuid}
            plan={plan}
            kind={kind}
            onKindChange={onKindChange}
            headerContent={headerContent}
            loadingMessage={LOADING_MESSAGE}
            flush={flush}
        />
    );
};
