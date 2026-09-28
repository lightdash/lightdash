import {
    buildComposerVizConfig,
    ECHARTS_DEFAULT_COLORS,
    getComposerFieldConfig,
    getComposerSeriesSplitLayout,
    VizIndexType,
    type AllVizChartConfig,
    type ComposerChartKind,
    type ComposerVizAxes,
    type PivotChartLayout,
    type RawResultRow,
    type ResultColumn,
} from '@lightdash/common';
import {
    Box,
    Center,
    Loader,
    Stack,
    useComputedColorScheme,
} from '@mantine/core';
import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import BigNumberView from '../../../../../components/DataViz/visualizations/BigNumberView';
import ChartView from '../../../../../components/DataViz/visualizations/ChartView';
import { useProjectColorPalette } from '../../../../../hooks/appearance/useProjectColorPalette';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AiComposerResultsExpired } from './AiComposerResultsExpired';
import {
    buildComposerChartSpec,
    buildComposerSeriesSplitSpec,
    type ComposerCartesianKind,
} from './composerChartSpec';
import { useArtifactResultRows } from './useArtifactResultRows';
import {
    ComposerSeriesSplitExpiredError,
    useComposerSeriesSplit,
} from './useComposerSeriesSplit';

// ChartView only needs the kind and a complete x/y; row-drawn charts keep a category x.
const chartViewConfigOf = (
    kind: ComposerChartKind,
    axes: ComposerVizAxes,
): AllVizChartConfig =>
    buildComposerVizConfig({
        kind,
        fieldConfig: {
            ...getComposerFieldConfig({ ...axes, seriesSplit: null }),
            x: axes.x
                ? { reference: axes.x.reference, type: VizIndexType.CATEGORY }
                : undefined,
        },
    });

const useChartColors = (projectUuid: string) => {
    const isDark = useComputedColorScheme('light') === 'dark';
    const { data: palette } = useProjectColorPalette(projectUuid);
    return useMemo(
        () =>
            (isDark ? palette?.darkColors : undefined) ??
            palette?.colors ??
            ECHARTS_DEFAULT_COLORS,
        [isDark, palette],
    );
};

type ChartProps = {
    projectUuid: string;
    kind: ComposerChartKind;
    columns: ResultColumn[];
    rows: RawResultRow[];
    axes: ComposerVizAxes;
};

// The data models resolve their pivot asynchronously; undefined while building.
const useComposerChartSpec = <Input, Spec>(
    input: Input | undefined,
    build: (input: Input) => Promise<Spec>,
): Spec | undefined => {
    const [built, setBuilt] = useState<{ input: Input; spec: Spec } | null>(
        null,
    );
    useEffect(() => {
        if (input === undefined) return undefined;
        let active = true;
        void build(input).then((spec) => {
            if (active) setBuilt({ input, spec });
        });
        return () => {
            active = false;
        };
    }, [input, build]);
    return built && built.input === input ? built.spec : undefined;
};

// Charts the rows already fetched for the table; nothing hits the server.
const ComposerChart: FC<ChartProps> = ({
    projectUuid,
    kind,
    columns,
    rows,
    axes,
}) => {
    const colors = useChartColors(projectUuid);
    const input = useMemo(
        () => ({ kind, columns, rows, axes, colors }),
        [kind, columns, rows, axes, colors],
    );
    const spec = useComposerChartSpec(input, buildComposerChartSpec);

    if (kind === 'big_number') {
        return (
            <BigNumberView
                spec={spec?.kind === 'big_number' ? spec.spec : undefined}
                isLoading={spec === undefined}
                hasValueField
            />
        );
    }
    return (
        <ChartView
            config={chartViewConfigOf(kind, axes)}
            spec={spec?.kind === 'echarts' ? spec.option : undefined}
            isLoading={spec === undefined}
            style={{ height: '100%', width: '100%' }}
        />
    );
};

type SeriesSplitProps = {
    projectUuid: string;
    queryUuid: string;
    kind: ComposerCartesianKind;
    layout: PivotChartLayout;
    headerContent: ReactNode;
    loadingMessage: string;
};

// A series split is pivoted on the server from the node's stored result.
const ComposerSeriesSplitChart: FC<SeriesSplitProps> = ({
    projectUuid,
    queryUuid,
    kind,
    layout,
    headerContent,
    loadingMessage,
}) => {
    const colors = useChartColors(projectUuid);
    const split = useComposerSeriesSplit({ projectUuid, queryUuid, layout });
    const input = useMemo(
        () =>
            split.data
                ? { kind, result: split.data, layout, colors }
                : undefined,
        [kind, split.data, layout, colors],
    );
    const option = useComposerChartSpec(input, buildComposerSeriesSplitSpec);

    if (split.error instanceof ComposerSeriesSplitExpiredError) {
        return <AiComposerResultsExpired headerContent={headerContent} />;
    }
    if (!split.data && !split.error) {
        return (
            <Center h={300}>
                <Loader type="dots" delayedMessage={loadingMessage} />
            </Center>
        );
    }
    return (
        <Stack gap="md" h="100%" mih={0}>
            {headerContent}
            <Box flex={1} mih={0} px="md" pb="md">
                <ChartView
                    config={buildComposerVizConfig({
                        kind,
                        fieldConfig: layout,
                    })}
                    spec={option}
                    isLoading={!split.error && option === undefined}
                    error={
                        split.error ? { message: split.error.message } : null
                    }
                    style={{ height: '100%', width: '100%' }}
                />
            </Box>
        </Stack>
    );
};

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    /** The displayed node's stored result, re-read for a series split; null when there is none. */
    seriesSplitQueryUuid: string | null;
    kind: ComposerChartKind;
    axes: ComposerVizAxes;
    headerContent: ReactNode;
    loadingMessage: string;
};

export const AiComposerChartVisualization: FC<Props> = ({
    projectUuid,
    results,
    seriesSplitQueryUuid,
    kind,
    axes,
    headerContent,
    loadingMessage,
}) => {
    const { columns, rows, isLoading } = useArtifactResultRows(results);
    // Pie and big number ignore a series split.
    const split = useMemo(() => {
        if (kind !== 'bar' && kind !== 'line') return null;
        const layout = getComposerSeriesSplitLayout(axes);
        return layout ? { kind, layout } : null;
    }, [kind, axes]);

    if (split && seriesSplitQueryUuid !== null) {
        return (
            <ComposerSeriesSplitChart
                projectUuid={projectUuid}
                queryUuid={seriesSplitQueryUuid}
                kind={split.kind}
                layout={split.layout}
                headerContent={headerContent}
                loadingMessage={loadingMessage}
            />
        );
    }

    if (isLoading) {
        return (
            <Center h={300}>
                <Loader type="dots" delayedMessage={loadingMessage} />
            </Center>
        );
    }

    return (
        <Stack gap="md" h="100%" mih={0}>
            {headerContent}
            <Box flex={1} mih={0} px="md" pb="md">
                <ComposerChart
                    projectUuid={projectUuid}
                    kind={kind}
                    columns={columns}
                    rows={rows}
                    axes={axes}
                />
            </Box>
        </Stack>
    );
};
