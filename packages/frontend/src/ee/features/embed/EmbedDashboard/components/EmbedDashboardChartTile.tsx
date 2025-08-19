import { mergeExisting } from '@lightdash/common';
import { Box } from '@mantine/core';
import { produce } from 'immer';
import { useMemo, type ComponentProps, type FC } from 'react';
import type DashboardChartTile from '../../../../../components/DashboardTiles/DashboardChartTile';
import { GenericDashboardChartTile } from '../../../../../components/DashboardTiles/DashboardChartTile';
import TileBase from '../../../../../components/DashboardTiles/TileBase';
import type { DashboardChartReadyQuery } from '../../../../../hooks/dashboard/useDashboardChartReadyQuery';
import type { InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import useEmbed from '../../../../providers/Embed/useEmbed';
import { useEmbedChartAndResults } from '../hooks';

type Props = ComponentProps<typeof DashboardChartTile> & {
    projectUuid: string;
    dashboardSlug: string;
    locked: boolean;
    tileIndex: number;
};

const EmbedDashboardChartTile: FC<Props> = ({
    projectUuid,
    dashboardSlug,
    locked,
    canExportCsv,
    canExportImages,
    canExportPagePdf,
    canDateZoom,
    tile,
    tileIndex,
    ...rest
}) => {
    const { languageMap, onExplore } = useEmbed();

    const { isLoading, data, error } = useEmbedChartAndResults(
        projectUuid,
        tile.uuid,
    );

    const translatedTile = useMemo(() => {
        if (!languageMap) return tile;

        const tileLanguageMap =
            languageMap.dashboard?.[dashboardSlug]?.tiles?.[tileIndex];
        if (!tileLanguageMap) return tile;

        return produce(tile, (draft) => {
            draft.properties = mergeExisting(
                draft.properties,
                tileLanguageMap.properties,
            );
        });
    }, [dashboardSlug, languageMap, tile, tileIndex]);

    const translatedChartData = useMemo(() => {
        if (!data) return undefined;

        const chartConfigLanguageMap = languageMap?.chart?.[data.chart.slug];

        if (!chartConfigLanguageMap) return data;

        return produce(data, (draft) => {
            draft.chart = mergeExisting(draft.chart, chartConfigLanguageMap);
        });
    }, [data, languageMap?.chart]);

    // Mimic the DashboardChartReadyQuery object
    const query = useMemo<DashboardChartReadyQuery | undefined>(() => {
        if (!translatedChartData) return undefined;

        return {
            executeQueryResponse: {
                queryUuid: '', // Does not use paginated query therefore there's no queryUuid
                appliedDashboardFilters:
                    translatedChartData.appliedDashboardFilters ?? {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                cacheMetadata: translatedChartData.cacheMetadata,
                metricQuery: translatedChartData?.metricQuery,
                fields: translatedChartData?.fields,
                parameterReferences: [],
                usedParametersValues: {}, // This is never used in embed endpoints/results, it's calculated in the backend from the saved parameters of the charts
            },
            chart: translatedChartData.chart,
            explore: translatedChartData.explore,
        } satisfies DashboardChartReadyQuery;
    }, [translatedChartData]);

    const resultData = useMemo<InfiniteQueryResults>(
        () =>
            ({
                queryUuid: '', // Does not use paginated query therefore there's no queryUuid
                rows: translatedChartData?.rows ?? [],
                totalResults: translatedChartData?.rows.length,
                initialQueryExecutionMs: 0,
                isFetchingRows: false,
                isFetchingAllPages: false,
                fetchMoreRows: () => undefined,
                setFetchAll: () => undefined,
                fetchAll: true,
                hasFetchedAllRows: true,
                totalClientFetchTimeMs: 0,
                isInitialLoading: false,
                isFetchingFirstPage: false,
                projectUuid: translatedChartData?.chart.projectUuid,
                error: error,
            } satisfies InfiniteQueryResults),
        [translatedChartData, error],
    );

    if (locked) {
        return (
            <Box h="100%">
                <TileBase
                    isLoading={false}
                    title={''}
                    tile={translatedTile}
                    {...rest}
                />
            </Box>
        );
    }

    return (
        <GenericDashboardChartTile
            {...rest}
            tile={translatedTile}
            isLoading={isLoading}
            canExportCsv={canExportCsv}
            canExportImages={canExportImages}
            canExportPagePdf={canExportPagePdf}
            canDateZoom={canDateZoom}
            resultsData={resultData}
            dashboardChartReadyQuery={query}
            error={error}
            onExplore={onExplore}
        />
    );
};

export default EmbedDashboardChartTile;
