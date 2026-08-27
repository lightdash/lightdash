import { useHotkeys } from '@mantine/hooks';
import { useCallback, useEffect, useMemo } from 'react';
import {
    explorerActions,
    selectChartTypeAuthoring,
    selectIsFieldSidebarOpen,
    selectIsVisualizationConfigOpen,
    selectIsVisualizationExpanded,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../features/explorer/store';
import { ExplorerSection } from '../../providers/Explorer/types';
import { useIsChartGalleryEnabled } from './ChartGallery/useIsChartGalleryEnabled';

export const FIELD_SIDEBAR_SHORTCUT = 'mod + b';
export const CHART_SIDEBAR_SHORTCUT = 'mod + alt + b';

const debugLog = (payload: {
    hypothesisId: string;
    location: string;
    message: string;
    data: Record<string, unknown>;
}) => {
    // #region agent log
    void fetch('/__cursor-debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, timestamp: Date.now() }),
        keepalive: true,
    });
    // #endregion
};

export const useExplorerSidebarShortcuts = ({
    enabled,
}: {
    enabled: boolean;
}) => {
    const dispatch = useExplorerDispatch();
    const isChartGalleryEnabled = useIsChartGalleryEnabled();
    const isFieldSidebarOpen = useExplorerSelector(selectIsFieldSidebarOpen);
    const isVisualizationConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const isVisualizationExpanded = useExplorerSelector(
        selectIsVisualizationExpanded,
    );
    const chartTypeAuthoring = useExplorerSelector(selectChartTypeAuthoring);

    useEffect(() => {
        // #region agent log
        debugLog({
            hypothesisId: 'C',
            location: 'useExplorerSidebarShortcuts.ts:registration',
            message: 'Shortcut registration inputs',
            data: { enabled, isChartGalleryEnabled },
        });
        // #endregion
    }, [enabled, isChartGalleryEnabled]);

    useEffect(() => {
        const handleRawKeyDown = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() !== 'b') return;

            const target = event.target;
            // #region agent log
            debugLog({
                hypothesisId: 'A,B',
                location: 'useExplorerSidebarShortcuts.ts:raw-keydown',
                message: 'Raw B keydown reached document',
                data: {
                    key: event.key,
                    code: event.code,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    altKey: event.altKey,
                    shiftKey: event.shiftKey,
                    repeat: event.repeat,
                    defaultPrevented: event.defaultPrevented,
                    targetTag:
                        target instanceof HTMLElement ? target.tagName : null,
                    targetContentEditable:
                        target instanceof HTMLElement
                            ? target.isContentEditable
                            : null,
                },
            });
            // #endregion
        };

        document.documentElement.addEventListener(
            'keydown',
            handleRawKeyDown,
            true,
        );
        return () =>
            document.documentElement.removeEventListener(
                'keydown',
                handleRawKeyDown,
                true,
            );
    }, []);

    useEffect(() => {
        // #region agent log
        debugLog({
            hypothesisId: 'D,E',
            location: 'useExplorerSidebarShortcuts.ts:state',
            message: 'Explorer sidebar state observed',
            data: {
                isFieldSidebarOpen,
                isVisualizationConfigOpen,
                isVisualizationExpanded,
                chartTypeAuthoring,
            },
        });
        // #endregion
    }, [
        chartTypeAuthoring,
        isFieldSidebarOpen,
        isVisualizationConfigOpen,
        isVisualizationExpanded,
    ]);

    const toggleFieldSidebar = useCallback(
        (event: KeyboardEvent) => {
            // #region agent log
            debugLog({
                hypothesisId: 'A,B,D,E',
                location: 'useExplorerSidebarShortcuts.ts:field-handler',
                message: 'Field sidebar handler invoked',
                data: {
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    altKey: event.altKey,
                    targetTag:
                        event.target instanceof HTMLElement
                            ? event.target.tagName
                            : null,
                    isFieldSidebarOpenBefore: isFieldSidebarOpen,
                },
            });
            // #endregion
            dispatch(explorerActions.toggleFieldSidebar());
        },
        [dispatch, isFieldSidebarOpen],
    );

    const toggleChartSidebar = useCallback(
        (event: KeyboardEvent) => {
            // #region agent log
            debugLog({
                hypothesisId: 'B,D,E',
                location: 'useExplorerSidebarShortcuts.ts:chart-handler',
                message: 'Chart sidebar handler invoked',
                data: {
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    altKey: event.altKey,
                    isVisualizationConfigOpenBefore: isVisualizationConfigOpen,
                    isVisualizationExpandedBefore: isVisualizationExpanded,
                    chartTypeAuthoring,
                },
            });
            // #endregion
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
        },
        [
            chartTypeAuthoring,
            dispatch,
            isVisualizationConfigOpen,
            isVisualizationExpanded,
        ],
    );

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
