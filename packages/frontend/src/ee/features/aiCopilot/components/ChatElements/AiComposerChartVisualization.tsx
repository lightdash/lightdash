import {
    assertUnreachable,
    ChartKind,
    ECHARTS_DEFAULT_COLORS,
    VizAggregationOptions,
    VizIndexType,
    type AllVizChartConfig,
    type ComposerChartKind,
    type ComposerVizAxes,
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
import {
    buildComposerChartSpec,
    type ComposerChartSpec,
} from './composerChartSpec';
import { useArtifactResultRows } from './useArtifactResultRows';

// DataViz has no funnel config; ChartView renders that spec without one.
const chartKindOf = (
    kind: Exclude<ComposerChartKind, 'funnel'>,
): AllVizChartConfig['type'] => {
    switch (kind) {
        case 'bar':
        case 'horizontal':
            return ChartKind.VERTICAL_BAR;
        case 'line':
        case 'scatter':
            return ChartKind.LINE;
        case 'pie':
            return ChartKind.PIE;
        case 'big_number':
            return ChartKind.BIG_NUMBER;
        default:
            return assertUnreachable(kind, 'Unknown composer chart kind');
    }
};

// ChartView only needs the kind and a complete x/y to render a spec.
const chartViewConfigOf = (
    kind: ComposerChartKind,
    axes: ComposerVizAxes,
): AllVizChartConfig | undefined =>
    kind === 'funnel'
        ? undefined
        : ({
              metadata: { version: 1 },
              type: chartKindOf(kind),
              fieldConfig: {
                  x: axes.x
                      ? {
                            reference: axes.x.reference,
                            type: VizIndexType.CATEGORY,
                        }
                      : undefined,
                  y: [
                      {
                          reference: axes.y.reference,
                          aggregation: VizAggregationOptions.ANY,
                      },
                  ],
                  groupBy: [],
              },
              display: undefined,
          } as AllVizChartConfig);

type ChartProps = {
    projectUuid: string;
    kind: ComposerChartKind;
    columns: ResultColumn[];
    rows: RawResultRow[];
    axes: ComposerVizAxes;
};

// Charts the rows already fetched for the table; nothing hits the server.
const ComposerChart: FC<ChartProps> = ({
    projectUuid,
    kind,
    columns,
    rows,
    axes,
}) => {
    const isDark = useComputedColorScheme('light') === 'dark';
    const { data: palette } = useProjectColorPalette(projectUuid);
    const colors = useMemo(
        () =>
            (isDark ? palette?.darkColors : undefined) ??
            palette?.colors ??
            ECHARTS_DEFAULT_COLORS,
        [isDark, palette],
    );
    const input = useMemo(
        () => ({ kind, columns, rows, axes, colors }),
        [kind, columns, rows, axes, colors],
    );

    // The data models resolve their (constant) pivot asynchronously.
    const [built, setBuilt] = useState<{
        input: typeof input;
        spec: ComposerChartSpec;
    } | null>(null);
    useEffect(() => {
        let active = true;
        void buildComposerChartSpec(input).then((spec) => {
            if (active) setBuilt({ input, spec });
        });
        return () => {
            active = false;
        };
    }, [input]);

    const spec = built?.input === input ? built.spec : null;

    if (kind === 'big_number') {
        return (
            <BigNumberView
                spec={spec?.kind === 'big_number' ? spec.spec : undefined}
                isLoading={spec === null}
                hasValueField
            />
        );
    }
    return (
        <ChartView
            config={chartViewConfigOf(kind, axes)}
            spec={spec?.kind === 'echarts' ? spec.option : undefined}
            isLoading={spec === null}
            style={{ height: '100%', width: '100%' }}
        />
    );
};

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    kind: ComposerChartKind;
    axes: ComposerVizAxes;
    headerContent: ReactNode;
    loadingMessage: string;
};

export const AiComposerChartVisualization: FC<Props> = ({
    projectUuid,
    results,
    kind,
    axes,
    headerContent,
    loadingMessage,
}) => {
    const { columns, rows, isLoading } = useArtifactResultRows(results);

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
