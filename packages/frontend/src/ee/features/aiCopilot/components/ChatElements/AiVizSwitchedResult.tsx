import { type ComposerVizKind, type ComposerVizPlan } from '@lightdash/common';
import { Box } from '@mantine/core';
import { clsx } from 'clsx';
import { type FC, type ReactNode } from 'react';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import styles from './AiArtifactPanel.module.css';
import { AiArtifactTableVisualization } from './AiArtifactTableVisualization';
import { AiComposerChartVisualization } from './AiComposerChartVisualization';

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    plan: ComposerVizPlan;
    kind: ComposerVizKind;
    onKindChange: (kind: ComposerVizKind) => void;
    headerContent: ReactNode;
    loadingMessage: string;
    flush?: boolean;
};

// A result as its table or a chart from the same rows, with the viz switcher
// pill floating over it whenever more than the table fits.
export const AiVizSwitchedResult: FC<Props> = ({
    projectUuid,
    results,
    plan,
    kind,
    onKindChange,
    headerContent,
    loadingMessage,
    flush = false,
}) => {
    const axes = kind === 'table' ? undefined : plan.axes[kind];
    const showPill = !results.error && plan.availableKinds.length > 1;

    return (
        <Box className={styles.displayedResult}>
            <Box
                className={clsx(
                    styles.displayedResultBody,
                    showPill && styles.withPillClearance,
                )}
            >
                {kind !== 'table' && axes ? (
                    <AiComposerChartVisualization
                        projectUuid={projectUuid}
                        results={results}
                        kind={kind}
                        axes={axes}
                        headerContent={headerContent}
                        loadingMessage={loadingMessage}
                    />
                ) : (
                    <AiArtifactTableVisualization
                        results={results}
                        headerContent={headerContent}
                        loadingMessage={loadingMessage}
                        flush={flush}
                    />
                )}
            </Box>
            {showPill && (
                <Box className={styles.floatingPill}>
                    <AgentVisualizationChartTypeSwitcher
                        availableChartTypes={plan.availableKinds}
                        selectedChartType={kind}
                        onChartTypeChange={onKindChange}
                        variant="pill"
                    />
                </Box>
            )}
        </Box>
    );
};
