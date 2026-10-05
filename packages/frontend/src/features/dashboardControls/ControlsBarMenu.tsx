import { ActionIcon, Group, Menu, Switch, Tooltip } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import FilterRequirementsButton from '../dashboardFilters/FilterRequirements/FilterRequirementsButton';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';

// What the whole bar is set to, in one menu at its right end
const ControlsBarMenu: FC<{
    // Rules need a filter to make a rule for
    hasFilterRules: boolean;
    hasDateZoom: boolean;
}> = ({ hasFilterRules, hasDateZoom }) => {
    const isAddFilterDisabled = useDashboardContext(
        (c) => c.isAddFilterDisabled,
    );
    const setIsAddFilterDisabled = useDashboardContext(
        (c) => c.setIsAddFilterDisabled,
    );
    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);
    const setIsDateZoomDisabled = useDashboardContext(
        (c) => c.setIsDateZoomDisabled,
    );
    const filterBarPopovers = useFilterBarPopovers();
    const showsFilterRules = hasFilterRules && filterBarPopovers !== null;

    return (
        <Group gap={0} wrap="nowrap">
            {/* The rules popover opens under the menu button */}
            {showsFilterRules && (
                <FilterRequirementsButton align="end" trigger="anchor" />
            )}
            <Menu position="bottom-end" withinPortal closeOnItemClick={false}>
                <Menu.Target>
                    <Tooltip label="Controls bar options">
                        <ActionIcon aria-label="Controls bar options">
                            <MantineIcon icon={IconDots} color="dimmed" />
                        </ActionIcon>
                    </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        role="menuitemcheckbox"
                        aria-checked={!isAddFilterDisabled}
                        rightSection={
                            <Switch
                                size="xs"
                                checked={!isAddFilterDisabled}
                                readOnly
                                tabIndex={-1}
                                aria-hidden
                            />
                        }
                        onClick={() =>
                            setIsAddFilterDisabled(!isAddFilterDisabled)
                        }
                    >
                        Viewers can add controls
                    </Menu.Item>
                    {hasDateZoom && (
                        <Menu.Item
                            role="menuitemcheckbox"
                            aria-checked={!isDateZoomDisabled}
                            rightSection={
                                <Switch
                                    size="xs"
                                    checked={!isDateZoomDisabled}
                                    readOnly
                                    tabIndex={-1}
                                    aria-hidden
                                />
                            }
                            onClick={() =>
                                setIsDateZoomDisabled(!isDateZoomDisabled)
                            }
                        >
                            Date zoom visible to viewers
                        </Menu.Item>
                    )}
                    {showsFilterRules && (
                        <Menu.Item
                            closeMenuOnClick
                            onClick={filterBarPopovers.openRulesPopover}
                        >
                            Filter rules
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>
        </Group>
    );
};

export default ControlsBarMenu;
