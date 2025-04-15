import { mergeExisting, QueryHistoryStatus } from '@lightdash/common';
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
    embedToken: string;
    locked: boolean;
    tileIndex: number;
};

const EmbedDashboardChartTile: FC<Props> = ({
    projectUuid,
    dashboardSlug,
    embedToken,
    locked,
    canExportCsv,
    canExportImages,
    canExportPagePdf,
    canDateZoom,
    tile,
    tileIndex,
    ...rest
}) => {
    const { languageMap } = useEmbed();

    const { isLoading, data, error } = useEmbedChartAndResults(
        projectUuid,
        embedToken,
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
                    translatedChartData.appliedDashboardFilters ?? null,
                cacheMetadata: translatedChartData.cacheMetadata,
            },
            firstPage: {
                queryUuid: '', // Does not use paginated query therefore there's no queryUuid
                fields: translatedChartData.fields,
                metricQuery: translatedChartData.metricQuery,
                rows: translatedChartData.rows,
                status: QueryHistoryStatus.READY,
                initialQueryExecutionMs: 0,
                resultsPageExecutionMs: 0,
                totalResults: translatedChartData.rows.length,
                pageSize: translatedChartData.rows.length,
                page: 1,
                totalPageCount: 1,
                nextPage: undefined,
                previousPage: undefined,
                clientFetchTimeMs: 0,
            },
            chart: translatedChartData.chart,
            explore: translatedChartData.explore,
        } satisfies DashboardChartReadyQuery;
    }, [translatedChartData]);

    const resultData = useMemo<InfiniteQueryResults>(
        () =>
            ({
                queryUuid: '', // Does not use paginated query therefore there's no queryUuid
                metricQuery: translatedChartData?.metricQuery,
                fields: translatedChartData?.fields,
                rows: translatedChartData?.rows ?? [],
                totalResults: translatedChartData?.rows.length,
                isFetchingRows: false,
                fetchMoreRows: () => undefined,
                setFetchAll: () => undefined,
                fetchAll: true,
                hasFetchedAllRows: true,
                totalClientFetchTimeMs: 0,
                isInitialLoading: false,
                projectUuid: translatedChartData?.chart.projectUuid,
            } satisfies InfiniteQueryResults),
        [translatedChartData],
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
        />
    );
};

export default EmbedDashboardChartTile;
