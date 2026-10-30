import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Menu,
    Tooltip,
} from '@mantine/core';
import { IconDots, IconPencil } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState, type ComponentProps, type FC } from 'react';
import DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import { DashboardPerformanceWarning } from '../../components/common/Dashboard/DashboardPerformanceWarning';
import { useDashboardManageAccess } from '../../components/common/Dashboard/useDashboardManageAccess';
import MantineIcon from '../../components/common/MantineIcon';
import DashboardUpdateModal from '../../components/common/modal/DashboardUpdateModal';
import TruncatedText from '../../components/common/TruncatedText';
import AddTileButton from '../../components/DashboardTiles/AddTileButton';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import classes from './DashboardHeaderGuard.module.css';
import { isEditBandShown } from './editBand';
import pillClasses from './FilterPills.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = ComponentProps<typeof DashboardHeader>;

const EditBand: FC<Props> = ({
    dashboard,
    hasDashboardChanged,
    isSaving,
    activeTabUuid,
    dashboardTabs,
    dashboardTiles,
    onAddTiles,
    onNewChart,
    onCancel,
    onSaveDashboard,
    setAddingTab,
    className,
}) => {
    const { track } = useTracking();
    const [isUpdating, setIsUpdating] = useState(false);
    return (
        <Group
            className={clsx(classes.band, className)}
            justify="space-between"
            wrap="nowrap"
            data-testid="dashboard-edit-band"
        >
            <Group gap="xs" wrap="nowrap" miw={0}>
                <Badge
                    color="indigo"
                    size="sm"
                    flex="0 0 auto"
                    leftSection={<MantineIcon icon={IconPencil} size={12} />}
                >
                    Editing
                </Badge>
                <TruncatedText fz="sm" c="inherit" maxWidth="100%">
                    {dashboard.name}
                </TruncatedText>
                <DashboardPerformanceWarning
                    dashboardTiles={dashboardTiles}
                    dashboardTabs={dashboardTabs}
                />
            </Group>
            <Group gap="xs" wrap="nowrap" flex="0 0 auto">
                <AddTileButton
                    onAddTiles={onAddTiles}
                    disabled={isSaving}
                    setAddingTab={setAddingTab}
                    activeTabUuid={activeTabUuid}
                    dashboardTabs={dashboardTabs}
                    onNewChart={onNewChart}
                    radius="md"
                />
                <Tooltip
                    fz="xs"
                    position="bottom"
                    label="No changes to save"
                    disabled={hasDashboardChanged}
                    openDelay={200}
                >
                    <Box>
                        <Button
                            size="xs"
                            className={classes.save}
                            disabled={!hasDashboardChanged}
                            loading={isSaving}
                            onClick={onSaveDashboard}
                            // Alternate of the shipped header's Save marker
                            data-tour-scope="manage:Dashboard"
                            data-tour-step="2"
                            data-tour-route="/projects/:projectUuid/dashboards/:dashboardUuid/edit"
                            data-tour-label="Click Save changes"
                            data-tour-title="Create a dashboard"
                            data-tour-interactive="true"
                            data-tour-via='[data-tour-nav="new"] >> [data-tour-nav="new-dashboard"] >> [data-tour-anchor="dashboard-name"] >> [data-tour-anchor="dashboard-create-next"] >> [data-tour-anchor="space-option"][data-tour-value="Shared"] >> [data-tour-anchor="dashboard-create-submit"] >> [data-tour-anchor="add-tile"] >> [data-tour-anchor="add-saved-chart"] >> [data-tour-anchor="chart-picker"] >> [data-tour-anchor="chart-option"][data-tour-value="Orders over time"] >> [data-tour-anchor="add-charts-submit"]'
                            data-tour-docs="explore/dashboards.mdx#save-your-dashboard:1"
                        >
                            Save dashboard
                        </Button>
                    </Box>
                </Tooltip>
                <Button
                    variant="default"
                    size="xs"
                    disabled={isSaving}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Menu position="bottom-end" withArrow>
                    <Menu.Target>
                        <Tooltip fz="xs" label="Dashboard actions">
                            <ActionIcon
                                className={classes.more}
                                size="md"
                                aria-label="Dashboard actions"
                                disabled={isSaving}
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Tooltip>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconPencil} />}
                            onClick={() => {
                                setIsUpdating(true);
                                track({
                                    name: EventName.UPDATE_DASHBOARD_NAME_CLICKED,
                                });
                            }}
                        >
                            Edit details
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>
            {isUpdating && (
                <DashboardUpdateModal
                    uuid={dashboard.uuid}
                    opened
                    onClose={() => setIsUpdating(false)}
                    onConfirm={() => setIsUpdating(false)}
                />
            )}
        </Group>
    );
};

// Edit mode draws the band in place of the header. While a filter is edited
// the band is inert, Save and Cancel included: Apply or Cancel in the rail
// ends the filter, then Save ends the dashboard. A viewer's filter leaves the
// dashboard as it is: nothing to lock
export const DashboardHeaderGuard: FC<Props> = (props) => {
    const isLocked = useControlsSidebarSelector(
        (c) => c.isSidebarOpen && !c.isViewer,
    );
    const { userCanManageDashboard } = useDashboardManageAccess(
        props.dashboard,
    );
    return (
        <div
            // The shared dimming of what is inert while a filter is edited
            className={`${classes.guard} ${pillClasses.inert}`}
            inert={isLocked || undefined}
        >
            {isEditBandShown(props.isEditMode, true, userCanManageDashboard) ? (
                <EditBand {...props} />
            ) : (
                <DashboardHeader {...props} />
            )}
        </div>
    );
};
