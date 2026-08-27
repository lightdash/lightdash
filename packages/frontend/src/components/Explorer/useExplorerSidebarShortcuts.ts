import { useHotkeys } from '@mantine/hooks';
import { useCallback, useMemo } from 'react';
import {
    explorerActions,
    selectChartTypeAuthoring,
    selectIsVisualizationConfigOpen,
    selectIsVisualizationExpanded,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../features/explorer/store';
import { ExplorerSection } from '../../providers/Explorer/types';
import { useIsChartGalleryEnabled } from './ChartGallery/useIsChartGalleryEnabled';

export const FIELD_SIDEBAR_SHORTCUT = 'mod + b';
export const CHART_SIDEBAR_SHORTCUT = 'mod + alt + b';

export const useExplorerSidebarShortcuts = ({
    enabled,
}: {
    enabled: boolean;
}) => {
    const dispatch = useExplorerDispatch();
    const isChartGalleryEnabled = useIsChartGalleryEnabled();
    const isVisualizationConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const isVisualizationExpanded = useExplorerSelector(
        selectIsVisualizationExpanded,
    );
    const chartTypeAuthoring = useExplorerSelector(selectChartTypeAuthoring);

    const toggleFieldSidebar = useCallback(() => {
        dispatch(explorerActions.toggleFieldSidebar());
    }, [dispatch]);

    const toggleChartSidebar = useCallback(() => {
        if (chartTypeAuthoring !== null) return;

        if (isVisualizationConfigOpen) {
            dispatch(explorerActions.closeVisualizationConfig());
            return;
        }

        if (!isVisualizationExpanded) {
            dispatch(
                explorerActions.toggleExpandedSection(
                    ExplorerSection.VISUALIZATION,
                ),
            );
        }
        dispatch(explorerActions.openVisualizationConfig());
    }, [
        chartTypeAuthoring,
        dispatch,
        isVisualizationConfigOpen,
        isVisualizationExpanded,
    ]);

    const hotkeys = useMemo<Parameters<typeof useHotkeys>[0]>(() => {
        if (!enabled) return [];

        return [
            [
                FIELD_SIDEBAR_SHORTCUT,
                toggleFieldSidebar,
                { preventDefault: true },
            ],
            ...(isChartGalleryEnabled
                ? ([
                      [
                          CHART_SIDEBAR_SHORTCUT,
                          toggleChartSidebar,
                          { preventDefault: true },
                      ],
                  ] as Parameters<typeof useHotkeys>[0])
                : []),
        ];
    }, [
        enabled,
        isChartGalleryEnabled,
        toggleChartSidebar,
        toggleFieldSidebar,
    ]);

    useHotkeys(hotkeys);
};
