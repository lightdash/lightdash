import { Box } from '@mantine/core';
import { type ComponentProps, type FC } from 'react';
import type DashboardChartTile from '../../../../../components/DashboardTiles/DashboardChartTile';
import { GenericDashboardChartTile } from '../../../../../components/DashboardTiles/DashboardChartTile';
import TileBase from '../../../../../components/DashboardTiles/TileBase';
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
    ...rest
}) => {
    const { isLoading, data, error } = useEmbedChartAndResults(
        projectUuid,
        embedToken,
        rest.tile.uuid,
    );
    if (locked) {
        return (
            <Box h="100%">
                <TileBase isLoading={false} title={''} {...rest} />
            </Box>
        );
    }
    return (
        <GenericDashboardChartTile
            {...rest}
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
