import { mergeExisting } from '@lightdash/common';
import { Box } from '@mantine/core';
import { produce } from 'immer';
import { useMemo, type ComponentProps, type FC } from 'react';
import type DashboardChartTile from '../../../../../components/DashboardTiles/DashboardChartTile';
import { GenericDashboardChartTile } from '../../../../../components/DashboardTiles/DashboardChartTile';
import TileBase from '../../../../../components/DashboardTiles/TileBase';
import useEmbed from '../../../../providers/Embed/useEmbed';
import {
    useEmbedExecuteAsnycDashboardChartQuery,
    useEmbedInfiniteQueryResults,
} from '../hooks';

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

    const executeQuery = useEmbedExecuteAsnycDashboardChartQuery(
        projectUuid,
        embedToken,
        tile.uuid,
    );

    const chart = executeQuery.data?.chart;

    const resultsData = useEmbedInfiniteQueryResults(
        projectUuid,
        executeQuery.data?.executeQueryResponse.queryUuid,
        embedToken,
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

    const translatedChart = useMemo(() => {
        if (!chart) return undefined;

        const chartConfigLanguageMap = languageMap?.chart?.[chart.slug];

        if (!chartConfigLanguageMap) return chart;

        return produce({ chart }, (draft) => {
            draft.chart = mergeExisting(draft.chart, chartConfigLanguageMap);
        }).chart;
    }, [chart, languageMap?.chart]);

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
            isLoading={
                executeQuery.isLoading ||
                resultsData.isInitialLoading ||
                resultsData.isFetchingRows
            }
            canExportCsv={canExportCsv}
            canExportImages={canExportImages}
            canExportPagePdf={canExportPagePdf}
            canDateZoom={canDateZoom}
            resultsData={resultsData}
            dashboardChartReadyQuery={
                executeQuery?.data && translatedChart
                    ? {
                          ...executeQuery.data,
                          chart: translatedChart,
                      }
                    : undefined
            }
            error={executeQuery.error ?? resultsData.error}
        />
    );
};

export default EmbedDashboardChartTile;
