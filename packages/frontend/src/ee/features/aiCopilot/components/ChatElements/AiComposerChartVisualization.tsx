import {
    buildComposerVizConfig,
    composerVizNeedsPivot,
    ECHARTS_DEFAULT_COLORS,
    getComposerChartKind,
    resolveComposerVizColumns,
    VizIndexType,
    type AllVizChartConfig,
    type ComposerChartKind,
    type PivotChartLayout,
    type VizTableConfig,
} from '@lightdash/common';
import {
    Box,
    Center,
    Loader,
    Stack,
    Text,
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
    buildComposerPivotSpec,
    type ComposerChartSpec,
} from './composerChartSpec';
import { useArtifactResultRows } from './useArtifactResultRows';
import {
    ComposerPivotExpiredError,
    useComposerPivot,
} from './useComposerPivot';

export type ComposerChartVizConfig = Exclude<AllVizChartConfig, VizTableConfig>;

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

// The data models resolve their pivot asynchronously; the last spec stays while the next builds.
const useComposerChartSpec = <Input,>(
    input: Input | undefined,
    build: (input: Input) => Promise<ComposerChartSpec>,
): ComposerChartSpec | undefined => {
    const [spec, setSpec] = useState<ComposerChartSpec>();
    useEffect(() => {
        if (input === undefined) return undefined;
        let active = true;
        void build(input).then((built) => {
            if (active) setSpec(built);
        });
        return () => {
            active = false;
        };
    }, [input, build]);
    return spec;
};

// ChartView only reads the kind; row-drawn charts keep a category x.
const chartViewConfigOf = (
    kind: ComposerChartKind,
    layout: PivotChartLayout,
    isPivoted: boolean,
): AllVizChartConfig =>
    buildComposerVizConfig({
        kind,
        fieldConfig:
            isPivoted || !layout.x
                ? layout
                : {
                      ...layout,
                      x: {
                          reference: layout.x.reference,
                          type: VizIndexType.CATEGORY,
                      },
                  },
    });

const ChartBody: FC<{
    kind: ComposerChartKind;
    layout: PivotChartLayout;
    isPivoted: boolean;
    spec: ComposerChartSpec | undefined;
    error: Error | null;
}> = ({ kind, layout, isPivoted, spec, error }) => {
    // A spec built for the previous kind stays out until this kind's is ready.
    if (kind === 'big_number') {
        const bigNumber = spec?.kind === 'big_number' ? spec : undefined;
        return (
            <BigNumberView
                spec={bigNumber?.spec}
                isLoading={!error && bigNumber === undefined}
                hasValueField
            />
        );
    }
    const option = spec?.kind === 'echarts' ? spec.option : undefined;
    return (
        <ChartView
            config={chartViewConfigOf(kind, layout, isPivoted)}
            spec={option}
            isLoading={!error && option === undefined}
            error={error ? { message: error.message } : null}
            style={{ height: '100%', width: '100%' }}
        />
    );
};

const Frame: FC<{ headerContent: ReactNode; children: ReactNode }> = ({
    headerContent,
    children,
}) => (
    <Stack gap="md" h="100%" mih={0}>
        {headerContent}
        <Box flex={1} mih={0} px="md" pb="md">
            {children}
        </Box>
    </Stack>
);

const Loading: FC<{ message: string }> = ({ message }) => (
    <Center h={300}>
        <Loader type="dots" delayedMessage={message} />
    </Center>
);

type SpecInput =
    | ({ source: 'rows' } & Parameters<typeof buildComposerChartSpec>[0])
    | ({ source: 'pivot' } & Parameters<typeof buildComposerPivotSpec>[0]);

const buildSpecFrom = (input: SpecInput) =>
    input.source === 'rows'
        ? buildComposerChartSpec(input)
        : buildComposerPivotSpec(input);

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    /** The displayed node's stored result, re-read for a pivot; null when there is none. */
    pivotQueryUuid: string | null;
    vizConfig: ComposerChartVizConfig;
    headerContent: ReactNode;
    loadingMessage: string;
};

// Draws from the fetched rows, or from a pivot of the stored result on the
// compose engine for aggregations, series splits and value sorts. The last
// chart stays on screen until the next one is built.
export const AiComposerChartVisualization: FC<Props> = ({
    projectUuid,
    results,
    pivotQueryUuid,
    vizConfig,
    headerContent,
    loadingMessage,
}) => {
    const { columns, rows, isLoading } = useArtifactResultRows(results);
    const colors = useChartColors(projectUuid);
    const kind = getComposerChartKind(vizConfig);
    const layout = vizConfig.fieldConfig;
    // With a series split only the first y is charted.
    const pivotLayout = useMemo(() => {
        if (!layout || !composerVizNeedsPivot(layout)) return null;
        const isSplit = (layout.groupBy?.length ?? 0) > 0;
        return isSplit ? { ...layout, y: layout.y.slice(0, 1) } : layout;
    }, [layout]);
    const pivot = useComposerPivot({
        projectUuid,
        queryUuid: pivotQueryUuid,
        layout: pivotLayout,
    });
    const drawn = useMemo(
        () => (layout ? resolveComposerVizColumns(layout, columns) : null),
        [layout, columns],
    );
    const input = useMemo((): SpecInput | undefined => {
        if (pivotLayout) {
            return pivot.data
                ? {
                      source: 'pivot',
                      kind,
                      result: pivot.data,
                      layout: pivotLayout,
                      colors,
                  }
                : undefined;
        }
        return drawn && drawn.y.length > 0
            ? {
                  source: 'rows',
                  kind,
                  columns,
                  rows,
                  x: drawn.x,
                  y: drawn.y,
                  colors,
              }
            : undefined;
    }, [pivotLayout, pivot.data, kind, colors, drawn, columns, rows]);
    const spec = useComposerChartSpec(input, buildSpecFrom);

    if (pivot.error instanceof ComposerPivotExpiredError) {
        return <AiComposerResultsExpired headerContent={headerContent} />;
    }
    if (!layout || (!pivotLayout && !isLoading && !drawn)) {
        return (
            <Frame headerContent={headerContent}>
                <Center h="100%">
                    <Text size="xs" c="dimmed">
                        This chart uses columns that are not in the result
                    </Text>
                </Center>
            </Frame>
        );
    }
    if (!pivotLayout && isLoading && spec === undefined) {
        return <Loading message={loadingMessage} />;
    }
    return (
        <Frame headerContent={headerContent}>
            <ChartBody
                kind={kind}
                layout={pivotLayout ?? layout}
                isPivoted={pivotLayout !== null}
                spec={spec}
                error={pivot.error}
            />
        </Frame>
    );
};
