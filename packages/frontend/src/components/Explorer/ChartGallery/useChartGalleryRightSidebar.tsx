import { type ComponentProps } from 'react';
import {
    selectIsVisualizationConfigOpen,
    useExplorerSelector,
} from '../../../features/explorer/store';
import type Page from '../../common/Page/Page';
import VisualizationConfigPortal from '../VisualizationCard/VisualizationConfigPortal';
import { useIsChartGalleryEnabled } from './useIsChartGalleryEnabled';

type RightSidebarProps = Pick<
    ComponentProps<typeof Page>,
    | 'rightSidebar'
    | 'isRightSidebarOpen'
    | 'keepRightSidebarMounted'
    | 'noRightSidebarPadding'
>;

export const useChartGalleryRightSidebar = ({
    enabled,
}: {
    enabled: boolean;
}): RightSidebarProps => {
    const isVisualizationConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const isChartGalleryEnabled = useIsChartGalleryEnabled();

    return {
        rightSidebar:
            isChartGalleryEnabled && enabled ? (
                <VisualizationConfigPortal />
            ) : null,
        isRightSidebarOpen:
            isChartGalleryEnabled && enabled && isVisualizationConfigOpen,
        keepRightSidebarMounted: isChartGalleryEnabled,
        noRightSidebarPadding: isChartGalleryEnabled,
    };
};
