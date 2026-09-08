import { type ComponentProps } from 'react';
import {
    selectIsVisualizationConfigOpen,
    useExplorerSelector,
} from '../../../features/explorer/store';
import type Page from '../../common/Page/Page';
import VisualizationConfigPortal from '../VisualizationCard/VisualizationConfigPortal';

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

    return {
        rightSidebar: enabled ? <VisualizationConfigPortal /> : null,
        isRightSidebarOpen: enabled && isVisualizationConfigOpen,
        keepRightSidebarMounted: true,
        noRightSidebarPadding: true,
    };
};
