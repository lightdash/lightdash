import { Menu } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { type FC, type RefObject, useState } from 'react';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';

import { type EChartsReact } from '../EChartsReactWrapper';
import MantineIcon from '../common/MantineIcon';
import ExportImageModal from './ExportImageModal';

export const DashboardExportImage: FC<{
    echartRef: RefObject<EChartsReact | null> | undefined;
    chartName: string;
    isMinimal: boolean;
}> = ({ echartRef, chartName, isMinimal }) => {
    const { track } = useTracking();
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <Menu.Item
                icon={<MantineIcon icon={IconPhoto} />}
                onClick={() => {
                    if (isMinimal)
                        track({ name: EventName.EMBED_DOWNLOAD_IMAGE_CLICKED });
                    else track({ name: EventName.DOWNLOAD_IMAGE_CLICKED });
                    setIsModalOpen(true);
                }}
            >
                Export image
            </Menu.Item>
            <ExportImageModal
                echartRef={echartRef}
                chartName={chartName}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </>
    );
};
