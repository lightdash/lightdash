import { Badge, Box, Button, Checkbox, Menu, Tooltip } from '@mantine/core';
import { IconDots, IconListCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectIsAddFilterDisabled,
    useDashboardSelector,
} from '../dashboard/store';
import FilterRequirementsButton from '../dashboardFilters/FilterRequirements/FilterRequirementsButton';
import classes from './FilterPills.module.css';

const LABEL = 'Filter bar settings';

// The editor's "..." joined to "Add filter", in the shipped eye's place:
// whether viewers can add filters, and the shipped "Filter rules" popover,
// anchored here instead of on its own button
export const FilterBarMenu: FC = () => {
    const isAddFilterDisabled = useDashboardSelector(selectIsAddFilterDisabled);
    const setIsAddFilterDisabled = useDashboardContext(
        (c) => c.setIsAddFilterDisabled,
    );
    const toggleViewersCanAdd = () =>
        setIsAddFilterDisabled(!isAddFilterDisabled);
    return (
        <FilterRequirementsButton
            renderTarget={({ open, close, isOpen, requirementCount }) => (
                <Box display="flex" pos="relative">
                    {/* Not portalled: the rules popover anchors on this Box,
                        so clicks in the menu stay inside it and keep its edits */}
                    <Menu position="bottom-start" withinPortal={false}>
                        <Menu.Target>
                            <Tooltip label={LABEL}>
                                <Button
                                    aria-label={LABEL}
                                    size="xs"
                                    variant="default"
                                    color="gray"
                                    className={classes.joinedMenuTrigger}
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
                                data-corner
                            />
                        )}
                        <Menu.Dropdown>
                            {/* A checkbox item, as the section menu's: the
                                menu stays so the change shows */}
                            <Menu.Item
                                closeMenuOnClick={false}
                                leftSection={
                                    <Checkbox
                                        size="xs"
                                        checked={!isAddFilterDisabled}
                                        onChange={toggleViewersCanAdd}
                                        onClick={(event) =>
                                            event.stopPropagation()
                                        }
                                    />
                                }
                                onClick={toggleViewersCanAdd}
                            >
                                Viewers can add filters
                            </Menu.Item>
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
