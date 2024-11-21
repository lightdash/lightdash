import { Menu } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { type FC, type RefObject } from 'react';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

import type EChartsReact from 'echarts-for-react';
import { base64SvgToBase64Image, downloadImage } from '../ChartDownload';
import MantineIcon from '../common/MantineIcon';

const downloadChartImage = (
    echartRef: RefObject<EChartsReact> | undefined,
    chartName?: string,
) => {
    const chartInstance = echartRef?.current?.getEchartsInstance();
    if (!chartInstance) {
        console.error('Chart instance is not available');
        return;
    }

    const svgBase64 = chartInstance.getDataURL();
    const width = chartInstance.getWidth();
    base64SvgToBase64Image(
        svgBase64,
        width,
        'png',
        false, //isBackgroundTransparent,
    )
        .then((base64Image) => {
            downloadImage(base64Image, chartName);
        })
        .catch((e) => {
            console.error('Error downloading image', e);
        });
};

export const DashboardExportImage: FC<{
    echartRef: RefObject<EChartsReact> | undefined;
    chartName: string;
    isMinimal: boolean;
}> = ({ echartRef, chartName, isMinimal }) => {
    const { track } = useTracking();

    return (
        <Menu.Item
            icon={<MantineIcon icon={IconPhoto} />}
            onClick={async () => {
                if (isMinimal)
                    track({ name: EventName.EMBED_DOWNLOAD_IMAGE_CLICKED });
                else track({ name: EventName.DOWNLOAD_IMAGE_CLICKED });
                downloadChartImage(echartRef, chartName);
            }}
        >
            Export image
        </Menu.Item>
    );
};
