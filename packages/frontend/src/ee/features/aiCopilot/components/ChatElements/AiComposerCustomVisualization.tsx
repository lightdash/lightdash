import {
    getComposerCustomVizBoundFields,
    getEffectiveOptionValues,
    type ComposerCustomVizConfig,
    type DataAppVizContext,
    type SourceQuery,
} from '@lightdash/common';
import { useMemo, type FC, type ReactNode } from 'react';
import { DataAppVizFrame } from '../../../../../components/DataAppVizRenderer/DataAppVizFrame';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import {
    ComposerVizFrame,
    ComposerVizLoading,
} from './AiComposerChartVisualization';
import { useArtifactResultRows } from './useArtifactResultRows';
import { useComposerChartColors } from './useComposerChartColors';
import { useComposerCustomViz } from './useComposerCustomViz';

const NO_INTERACTIONS = {};

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    node: SourceQuery | null;
    vizConfig: ComposerCustomVizConfig;
    headerContent: ReactNode;
    loadingMessage: string;
};

// A composer result drawn through a custom chart type. There is no explore,
// so labels come from the result columns and explore-backed actions are off.
export const AiComposerCustomVisualization: FC<Props> = ({
    projectUuid,
    results,
    node,
    vizConfig,
    headerContent,
    loadingMessage,
}) => {
    const { columns, isLoading } = useArtifactResultRows(results);
    const colorPalette = useComposerChartColors(projectUuid);
    const {
        renderTarget,
        renderPinnedVersion,
        metadata,
        schema,
        fieldMapping,
    } = useComposerCustomViz({ projectUuid, vizConfig, columns, node });

    const rows = results.rows;
    const context = useMemo((): DataAppVizContext | undefined => {
        if (!schema || !fieldMapping) return undefined;
        const labels = new Map(
            columns.map((column) => [
                column.reference,
                column.label ?? column.reference,
            ]),
        );
        const bound = getComposerCustomVizBoundFields({
            ...vizConfig,
            fieldMapping,
        });
        return {
            fieldMapping,
            fields: Object.fromEntries(
                bound.map((reference) => [
                    reference,
                    { label: labels.get(reference) ?? reference },
                ]),
            ),
            rows,
            options: getEffectiveOptionValues(
                schema.configOptions,
                vizConfig.optionValues,
            ),
            colorPalette,
            seriesColors: {},
            valueColors: {},
            pivotDetails: null,
            subtotals: { enabled: false, dimensions: [] },
            underlyingData: { enabled: false },
            drillDown: { enabled: false },
            pointMenu: { enabled: false },
        };
    }, [schema, fieldMapping, columns, vizConfig, rows, colorPalette]);

    if (isLoading) return <ComposerVizLoading message={loadingMessage} />;

    return (
        <ComposerVizFrame headerContent={headerContent}>
            <DataAppVizFrame
                projectUuid={projectUuid}
                dataAppVizUuid={vizConfig.dataAppVizUuid}
                renderTarget={renderTarget}
                renderPinnedVersion={renderPinnedVersion}
                renderMetadata={metadata.data}
                renderMetadataError={metadata.error}
                chartContext={undefined}
                context={context}
                isLoading={!results.hasFetchedAllRows}
                isInDashboard={false}
                onScreenshotReady={undefined}
                errorReport={{
                    savedChartUuid: undefined,
                    pinnedVersion: renderPinnedVersion,
                }}
                removedHint={null}
                unavailablePlaceholder={{
                    message: `Custom chart type version ${renderPinnedVersion} is unavailable.`,
                }}
                interactions={NO_INTERACTIONS}
            />
        </ComposerVizFrame>
    );
};
