import { mergeExisting, QueryExecutionContext } from '@lightdash/common';
import { Box } from '@mantine/core';
import { produce } from 'immer';
import { useMemo, type ComponentProps, type FC } from 'react';
import type DashboardChartTile from '../../../../../components/DashboardTiles/DashboardChartTile';
import { GenericDashboardChartTile } from '../../../../../components/DashboardTiles/DashboardChartTile';
import TileBase from '../../../../../components/DashboardTiles/TileBase';
import { useDashboardChartReadyQuery } from '../../../../../hooks/dashboard/useDashboardChartReadyQuery';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import useEmbed from '../../../../providers/Embed/useEmbed';

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

    // Using the regular dashboard query flow with Embed context
    const readyQuery = useDashboardChartReadyQuery(
        tile.uuid,
        tile.properties?.savedChartUuid,
        QueryExecutionContext.EMBED,
    );

    const resultsData = useInfiniteQueryResults(
        readyQuery.data?.chart.projectUuid,
        readyQuery.data?.executeQueryResponse.queryUuid,
        readyQuery.data?.chart.name,
    );

    const isLoading = useMemo(() => {
        const isCreatingQuery = readyQuery.isFetching;
        const isFetchingFirstPage = resultsData.isFetchingFirstPage;
        const isFetchingAllRows =
            resultsData.fetchAll && !resultsData.hasFetchedAllRows;
        return (
            (isCreatingQuery || isFetchingFirstPage || isFetchingAllRows) &&
            !resultsData.error
        );
    }, [
        readyQuery.isFetching,
        resultsData.fetchAll,
        resultsData.hasFetchedAllRows,
        resultsData.isFetchingFirstPage,
        resultsData.error,
    ]);

    const error = readyQuery.error ?? resultsData.error;

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
        if (!readyQuery.data) return undefined;

        const chartConfigLanguageMap =
            languageMap?.chart?.[readyQuery.data.chart.slug];

        if (!chartConfigLanguageMap) return readyQuery.data;

        return produce(readyQuery.data, (draft) => {
            draft.chart = mergeExisting(draft.chart, chartConfigLanguageMap);
        });
    }, [readyQuery.data, languageMap?.chart]);

    // Apply language translations to the chart data if available
    const dashboardChartReadyQuery = translatedChartData;

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
            resultsData={resultsData}
            dashboardChartReadyQuery={dashboardChartReadyQuery}
            error={error}
            onExplore={onExplore}
        />
    );
};

export default EmbedDashboardChartTile;
