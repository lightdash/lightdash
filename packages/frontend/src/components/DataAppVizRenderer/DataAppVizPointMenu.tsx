import { type MetricQuery } from '@lightdash/common';
import { Box, Menu, Portal } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import { FilterDashboardTo } from '../../features/dashboardFilters/FilterDashboardTo';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { UnderlyingDataMenuItem } from '../DashboardTiles/UnderlyingDataMenuItem';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import classes from './DataAppVizRenderer.module.css';
import { type VizPointMenuState } from './vizPointMenuConfig';

type Props = {
    state: VizPointMenuState;
    onClose: () => void;
    metricQuery: MetricQuery | undefined;
    /** Render the underlying-data item; the renderer already permission-gates. */
    showUnderlyingData: boolean;
    onViewUnderlyingData: () => void;
    /** Render the cross-filter section (dashboard surface only). */
    showFilters: boolean;
    trackingData: {
        organizationId: string | undefined;
        userId: string | undefined;
        projectId: string | undefined;
    };
};

// Host-rendered context menu for a custom chart type's data-point click —
// the same items native chart menus compose, positioned over the iframe.
const DataAppVizPointMenu: FC<Props> = ({
    state,
    onClose,
    metricQuery,
    showUnderlyingData,
    onViewUnderlyingData,
    showFilters,
    trackingData,
}) => {
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });

    // FilterDashboardTo always leads with a Menu.Divider; suppress it when
    // filters is the only section so no dangling separator renders at the top.
    const hasPrecedingSection =
        state.copyValue !== undefined ||
        (showUnderlyingData && !!metricQuery) ||
        !!state.drillConfig;

    const handleCopy = () => {
        if (state.copyValue !== undefined) {
            clipboard.copy(state.copyValue);
            showToastSuccess({ title: 'Copied to clipboard!' });
        }
        onClose();
    };

    return (
        <>
            {/* Clicks inside the iframe never reach the host, so outside-click
                close needs this backdrop while the menu is open. */}
            <Portal>
                <Box
                    data-point-menu-backdrop
                    className={classes.pointMenuBackdrop}
                    pos="fixed"
                    inset={0}
                    onClick={onClose}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        onClose();
                    }}
                />
            </Portal>
            <Menu
                opened
                onClose={onClose}
                closeOnItemClick
                closeOnEscape
                position="right-start"
                offset={{ mainAxis: 0, crossAxis: 0 }}
            >
                <Portal>
                    <Menu.Target>
                        <Box
                            pos="absolute"
                            left={`${state.position.left}px`}
                            top={`${state.position.top}px`}
                        />
                    </Menu.Target>
                </Portal>
                <Menu.Dropdown>
                    {state.copyValue !== undefined && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCopy} />}
                            onClick={handleCopy}
                        >
                            Copy value
                        </Menu.Item>
                    )}
                    {showUnderlyingData && metricQuery && (
                        <UnderlyingDataMenuItem
                            metricQuery={metricQuery}
                            onViewUnderlyingData={() => {
                                onViewUnderlyingData();
                                onClose();
                            }}
                        />
                    )}
                    {state.drillConfig && (
                        <DrillDownMenuItem
                            {...state.drillConfig}
                            trackingData={trackingData}
                        />
                    )}
                    {showFilters && state.filters.length > 0 && (
                        <FilterDashboardTo
                            filters={state.filters}
                            withDivider={hasPrecedingSection}
                        />
                    )}
                </Menu.Dropdown>
            </Menu>
        </>
    );
};

export default DataAppVizPointMenu;
