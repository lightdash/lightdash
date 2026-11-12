import { Badge, Box, Button, Menu, Tooltip } from '@mantine/core';
import {
    IconCalendarCog,
    IconDots,
    IconEye,
    IconEyeOff,
    IconListCheck,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectAvailableCustomGranularities,
    selectDashboardTiles,
    selectIsAddFilterDisabled,
    selectIsDateZoomDisabled,
    useDashboardDateZoomConfig,
    useDashboardDateZoomGranularities,
    useDashboardSelector,
    useDefaultDateZoomGranularity,
} from '../dashboard/store';
import addClasses from '../dashboardFilters/AddFilterButton.module.css';
import FilterRequirementsButton from '../dashboardFilters/FilterRequirements/FilterRequirementsButton';
import { DateZoomGrainsMenu } from './DateZoomGrainsMenu';
import editorClasses from './FilterEditor.module.css';
import classes from './FilterPills.module.css';
import { MENU_TRANSITION } from './menuTransition';

const LABEL = 'Filter bar settings';

// Date zoom's dashboard-wide settings, where the shipped eye and the Default
// zoom menu's checklist were: hiding date zoom, and the grains viewers can pick
const DateZoomItems: FC = () => {
    const isDateZoomDisabled = useDashboardSelector(selectIsDateZoomDisabled);
    const setIsDateZoomDisabled = useDashboardContext(
        (c) => c.setIsDateZoomDisabled,
    );
    const granularities = useDashboardDateZoomGranularities();
    const setDateZoomGranularities = useDashboardContext(
        (c) => c.setDateZoomGranularities,
    );
    const defaultGranularity = useDefaultDateZoomGranularity();
    const setDefaultDateZoomGranularity = useDashboardContext(
        (c) => c.setDefaultDateZoomGranularity,
    );
    const customLabels = useDashboardSelector(
        selectAvailableCustomGranularities,
    );
    const { controls } = useDashboardDateZoomConfig();
    return (
        <>
            <Menu.Item
                leftSection={
                    <MantineIcon
                        icon={isDateZoomDisabled ? IconEye : IconEyeOff}
                        size={14}
                    />
                }
                onClick={() => setIsDateZoomDisabled(!isDateZoomDisabled)}
            >
                {isDateZoomDisabled
                    ? 'Show date zoom for viewers'
                    : 'Hide date zoom for viewers'}
            </Menu.Item>
            <Menu.Sub>
                <Menu.Sub.Target>
                    <Menu.Sub.Item
                        leftSection={
                            <MantineIcon icon={IconCalendarCog} size={14} />
                        }
                    >
                        Date zoom grains
                    </Menu.Sub.Item>
                </Menu.Sub.Target>
                <Menu.Sub.Dropdown className={editorClasses.menu}>
                    <DateZoomGrainsMenu
                        enabledGranularities={granularities}
                        customLabels={customLabels}
                        defaultGranularity={defaultGranularity ?? null}
                        namedZooms={controls}
                        onChange={(next, nextDefault) => {
                            setDateZoomGranularities(next);
                            if (nextDefault !== (defaultGranularity ?? null))
                                setDefaultDateZoomGranularity(
                                    nextDefault ?? undefined,
                                );
                        }}
                    />
                </Menu.Sub.Dropdown>
            </Menu.Sub>
        </>
    );
};

// The editor's "..." joined to "Add filter", in the shipped eye's place:
// showing "Add filter" and date zoom to viewers or not, date zoom's grains,
// and the shipped "Filter rules" popover, anchored here instead of on its own button
export const FilterBarMenu: FC = () => {
    const isAddFilterDisabled = useDashboardSelector(selectIsAddFilterDisabled);
    const setIsAddFilterDisabled = useDashboardContext(
        (c) => c.setIsAddFilterDisabled,
    );
    // As the shipped bar's date zoom: only on a dashboard with tiles
    const hasTiles = useDashboardSelector(
        (state) => (selectDashboardTiles(state)?.length ?? 0) > 0,
    );
    return (
        <FilterRequirementsButton
            renderTarget={({ open, close, isOpen, requirementCount }) => (
                <Box display="flex" pos="relative">
                    {/* Not portalled: the rules popover anchors on this Box,
                        so clicks in the menu stay inside it and keep its edits */}
                    <Menu
                        position="bottom-start"
                        withinPortal={false}
                        transitionProps={MENU_TRANSITION}
                    >
                        <Menu.Target>
                            <Tooltip label={LABEL}>
                                <Button
                                    aria-label={LABEL}
                                    size="xs"
                                    variant="default"
                                    color="gray"
                                    className={clsx(
                                        classes.joinedMenuTrigger,
                                        addClasses.splitBorder,
                                    )}
                                >
                                    <MantineIcon icon={IconDots} />
                                </Button>
                            </Tooltip>
                        </Menu.Target>
                        {requirementCount > 0 && (
                            <Box
                                component="span"
                                role="img"
                                aria-label={`${requirementCount} filter rule${requirementCount === 1 ? '' : 's'}`}
                                className={classes.rulesDot}
                            />
                        )}
                        <Menu.Dropdown className={editorClasses.menu}>
                            {/* As the shipped pin item: icon and label name
                                the action, and swap with the state */}
                            <Menu.Item
                                leftSection={
                                    <MantineIcon
                                        icon={
                                            isAddFilterDisabled
                                                ? IconEye
                                                : IconEyeOff
                                        }
                                        size={14}
                                    />
                                }
                                onClick={() =>
                                    setIsAddFilterDisabled(!isAddFilterDisabled)
                                }
                            >
                                {isAddFilterDisabled
                                    ? 'Show Add filter for viewers'
                                    : 'Hide Add filter for viewers'}
                            </Menu.Item>
                            {hasTiles && <DateZoomItems />}
                            <Menu.Divider />
                            <Menu.Item
                                leftSection={
                                    <MantineIcon
                                        icon={IconListCheck}
                                        size={14}
                                    />
                                }
                                rightSection={
                                    requirementCount > 0 ? (
                                        <Badge
                                            size="xs"
                                            color="yellow"
                                            autoContrast
                                            circle
                                        >
                                            {requirementCount}
                                        </Badge>
                                    ) : undefined
                                }
                                onClick={isOpen ? close : open}
                            >
                                Filter rules
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Box>
            )}
        />
    );
};
