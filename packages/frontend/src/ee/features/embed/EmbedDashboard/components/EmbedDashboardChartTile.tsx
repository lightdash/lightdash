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
    embedToken: string;
    locked: boolean;
    tileIndex: number;
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
    tileIndex,
    ...rest
}) => {
    const { isLoading, data, error } = useEmbedChartAndResults(
        projectUuid,
        embedToken,
        tile.uuid,
    );

    const { t } = useEmbed();
    const translatedTile = useMemo(
        () => ({
            ...tile,
            properties: {
                ...tile.properties,
                title:
                    t(`tiles.${tileIndex}.properties.title`) ??
                    tile.properties.title,
            },
        }),
        [tile, tileIndex, t],
    );

    const translatedChartData = useMemo(() => {
        return produce(data, (draft) => {
            if (!draft) return;

            // TODO: typeguard and add other chart types
            const eChartsConfig =
                // @ts-ignore
                draft?.chart?.chartConfig?.config?.eChartsConfig;

            if (eChartsConfig?.xAxis) {
                // TODO: fix any
                eChartsConfig.xAxis.forEach((axis: any, index: number) => {
                    axis.name =
                        t(`${draft.chart.slug}.config.xAxis.${index}.name`) ??
                        axis.name;
                });
            }

            if (eChartsConfig.yAxis) {
                eChartsConfig.yAxis.forEach((axis: any, index: number) => {
                    axis.name =
                        t(`${draft.chart.slug}.config.yAxis.${index}.name`) ??
                        axis.name;
                });
            }

            if (eChartsConfig.series) {
                eChartsConfig.series.forEach((series: any, index: number) => {
                    series.name =
                        t(`${draft.chart.slug}.config.series.${index}.name`) ??
                        series.name;
                });
            }
        });
    }, [data, t]);

    console.log('tiles', { translatedTile, data, translatedChartData });

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
