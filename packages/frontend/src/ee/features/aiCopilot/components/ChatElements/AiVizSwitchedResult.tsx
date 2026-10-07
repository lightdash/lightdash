import {
    buildComposerVizConfig,
    ChartKind,
    getComposerFieldConfig,
    type ComposerVizKind,
    type ComposerVizPlan,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { clsx } from 'clsx';
import { useMemo, type FC, type ReactNode } from 'react';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import styles from './AiArtifactPanel.module.css';
import { AiArtifactTableVisualization } from './AiArtifactTableVisualization';
import { AiComposerChartVisualization } from './AiComposerChartVisualization';

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    /** Stored result a pivot re-reads; null when there is none. */
    pivotQueryUuid: string | null;
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
    pivotQueryUuid,
    plan,
    kind,
    onKindChange,
    headerContent,
    loadingMessage,
    flush = false,
}) => {
    const vizConfig = useMemo(() => {
        if (kind === 'table') return null;
        const axes = plan.axes[kind];
        return axes
            ? buildComposerVizConfig({
                  kind,
                  fieldConfig: getComposerFieldConfig(axes),
              })
            : null;
    }, [kind, plan]);
    const showPill = !results.error && plan.availableKinds.length > 1;

    return (
        <Box className={styles.displayedResult}>
            <Box
                className={clsx(
                    styles.displayedResultBody,
                    showPill && styles.withPillClearance,
                )}
            >
                {vizConfig && vizConfig.type !== ChartKind.TABLE ? (
                    <AiComposerChartVisualization
                        projectUuid={projectUuid}
                        results={results}
                        pivotQueryUuid={pivotQueryUuid}
                        vizConfig={vizConfig}
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
