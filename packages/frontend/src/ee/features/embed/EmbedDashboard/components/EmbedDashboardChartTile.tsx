import { Box } from '@mantine/core';
import { type ComponentProps, type FC } from 'react';
import type DashboardChartTile from '../../../../../components/DashboardTiles/DashboardChartTile';
import { GenericDashboardChartTile } from '../../../../../components/DashboardTiles/DashboardChartTile';
import TileBase from '../../../../../components/DashboardTiles/TileBase';
import useEmbed from '../../../../providers/Embed/useEmbed';
import { useEmbedChartAndResults } from '../hooks';

type Props = ComponentProps<typeof DashboardChartTile> & {
    projectUuid: string;
    embedToken: string;
    locked: boolean;
};

const EmbedDashboardChartTile: FC<Props> = ({
    projectUuid,
    embedToken,
    locked,
    canExportCsv,
    canExportImages,
    canExportPagePdf,
    canDateZoom,
    tile,
    ...rest
}) => {
    const { isLoading, data, error } = useEmbedChartAndResults(
        projectUuid,
        embedToken,
        tile.uuid,
    );

    const { t } = useEmbed();

    const translatedTitle = t(
        `dashboard.tiles.${tile.properties.chartSlug}.title`,
    );
    const translatedTile = {
        ...tile,
        properties: {
            ...tile.properties,
            title: translatedTitle ?? tile.properties.title,
        },
    };

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
            data={data}
            error={error}
        />
    );
};

export default EmbedDashboardChartTile;
