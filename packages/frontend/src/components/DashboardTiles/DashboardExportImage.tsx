import { Menu } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUiString } from '../../ee/providers/Embed/useUiStrings';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

export const DashboardExportImage: FC<{
    onClick: () => void;
    isMinimal: boolean;
}> = ({ onClick, isMinimal }) => {
    const { track } = useTracking();
    const exportImageLabel = useUiString('tileMenu.exportImage');

    return (
        <Menu.Item
            leftSection={<MantineIcon icon={IconPhoto} />}
            onClick={() => {
                if (isMinimal)
                    track({ name: EventName.EMBED_DOWNLOAD_IMAGE_CLICKED });
                else track({ name: EventName.DOWNLOAD_IMAGE_CLICKED });
                onClick();
            }}
        >
            {exportImageLabel}
        </Menu.Item>
    );
};
