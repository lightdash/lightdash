import { mergeExisting } from '@lightdash/common';
import { Box } from '@mantine/core';
import { produce } from 'immer';
import { useMemo, type ComponentProps, type FC } from 'react';
import type DashboardChartTile from '../../../../../components/DashboardTiles/DashboardChartTile';
import { GenericDashboardChartTile } from '../../../../../components/DashboardTiles/DashboardChartTile';
import TileBase from '../../../../../components/DashboardTiles/TileBase';
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
            data={translatedChartData}
            error={error}
        />
    );
};

export default EmbedDashboardChartTile;
