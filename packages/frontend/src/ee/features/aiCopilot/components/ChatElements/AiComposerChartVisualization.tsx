import {
    assertUnreachable,
    buildComposerChartData,
    CartesianChartDataModel,
    ChartKind,
    ECHARTS_DEFAULT_COLORS,
    type AllVizChartConfig,
    type AnyType,
    type ComposerVizKind,
    type RawResultRow,
    type ResultColumn,
} from '@lightdash/common';
import {
    Box,
    Center,
    Loader,
    Stack,
    useMantineColorScheme,
} from '@mantine/core';
import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import ChartView from '../../../../../components/DataViz/visualizations/ChartView';
import { SqlChartResultsRunner } from '../../../../../features/sqlRunner/runners/SqlRunnerResultsRunnerFrontend';
import { useProjectColorPalette } from '../../../../../hooks/appearance/useProjectColorPalette';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useArtifactResultRows } from './useArtifactResultRows';

export type ComposerChartKind = Exclude<ComposerVizKind, 'table'>;

type CartesianKind = ChartKind.VERTICAL_BAR | ChartKind.LINE;

const cartesianKindOf = (kind: ComposerChartKind): CartesianKind => {
    switch (kind) {
        case 'bar':
            return ChartKind.VERTICAL_BAR;
        case 'line':
            return ChartKind.LINE;
        case 'horizontal':
        case 'scatter':
        case 'pie':
        case 'funnel':
            throw new Error(`Composer viz kind not supported yet: ${kind}`);
        default:
            return assertUnreachable(kind, 'Unknown composer viz kind');
    }
};

type ChartProps = {
    projectUuid: string;
    kind: ComposerChartKind;
    columns: ResultColumn[];
    rows: RawResultRow[];
    x: ResultColumn;
    y: ResultColumn;
};

/**
 * Charts the rows already fetched for the table: x as the index, y as the
 * value, through the constant-function results runner. Nothing hits the server.
 */
const ComposerChart: FC<ChartProps> = ({
    projectUuid,
    kind,
    columns,
    rows,
    x,
    y,
}) => {
    const { colorScheme } = useMantineColorScheme();
    const { data: palette } = useProjectColorPalette(projectUuid);
    const colors = useMemo(
        () =>
            (colorScheme === 'dark' ? palette?.darkColors : undefined) ??
            palette?.colors ??
            ECHARTS_DEFAULT_COLORS,
        [colorScheme, palette],
    );

    const { model, config } = useMemo(() => {
        const { data, layout } = buildComposerChartData({ rows, x, y });
        const resultsRunner = new SqlChartResultsRunner({
            pivotChartData: data,
            originalColumns: Object.fromEntries(
                columns.map((column) => [column.reference, column]),
            ),
        });
        const type = cartesianKindOf(kind);
        const vizConfig: AllVizChartConfig = {
            metadata: { version: 1 },
            type,
            fieldConfig: layout,
            display: undefined,
        };
        return {
            model: new CartesianChartDataModel({
                resultsRunner,
                fieldConfig: layout,
                type,
            }),
            config: vizConfig,
        };
    }, [rows, columns, x, y, kind]);

    // The data model resolves its (constant) pivot asynchronously.
    const [spec, setSpec] = useState<{
        model: CartesianChartDataModel;
        value: Record<string, AnyType>;
    } | null>(null);
    useEffect(() => {
        let active = true;
        void model
            .getPivotedChartData({
                sql: '',
                limit: rows.length,
                sortBy: [],
                filters: [],
            })
            .then(() => {
                if (active) {
                    setSpec({ model, value: model.getSpec(undefined, colors) });
                }
            });
        return () => {
            active = false;
        };
    }, [model, rows.length, colors]);

    const currentSpec = spec?.model === model ? spec.value : undefined;

    return (
        <ChartView
            config={config}
            spec={currentSpec}
            isLoading={currentSpec === undefined}
            style={{ height: '100%', width: '100%' }}
        />
    );
};

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    kind: ComposerChartKind;
    x: ResultColumn;
    y: ResultColumn;
    headerContent: ReactNode;
    loadingMessage: string;
};

export const AiComposerChartVisualization: FC<Props> = ({
    projectUuid,
    results,
    kind,
    x,
    y,
    headerContent,
    loadingMessage,
}) => {
    const { columns, rows, isLoading } = useArtifactResultRows(results);

    if (isLoading) {
        return (
            <Center h={300}>
                <Loader
                    type="dots"
                    color="ldGray.6"
                    delayedMessage={loadingMessage}
                />
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
                    x={x}
                    y={y}
                />
            </Box>
        </Stack>
    );
};
