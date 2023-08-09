import { DashboardTileTypes } from '@lightdash/common';
import { Button, Flex, Popover, Text, Tooltip } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '../../hooks/useProject';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import MantineIcon from '../common/MantineIcon';
import ActiveFilters from './ActiveFilters';
import FilterSearch from './FilterSearch';

interface Props {
    isEditMode: boolean;
}

const DashboardFilter: FC<Props> = ({ isEditMode }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

    const project = useProject(projectUuid);
    const {
        allFilters,
        fieldsWithSuggestions,
        dashboardTiles,
        allFilterableFields,
    } = useDashboardContext();

    const hasChartTiles =
        dashboardTiles.filter(
            (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
        ).length >= 1;

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            fieldsMap={fieldsWithSuggestions}
            startOfWeek={project.data?.warehouseConnection?.startOfWeek}
            dashboardFilters={allFilters}
        >
            <Flex gap={3} mb={8} ml={8} wrap="wrap">
                <Popover
                    position="bottom-start"
                    trapFocus
                    opened={isFilterPopoverOpen}
                    disabled={!hasChartTiles}
                    onClose={() => setIsFilterPopoverOpen(false)}
                    transitionProps={{
                        transition: 'pop',
                    }}
                    withArrow
                    shadow="md"
                    offset={-1}
                    keepMounted
                >
                    <Popover.Target>
                        <Tooltip
                            disabled={isFilterPopoverOpen || isEditMode}
                            position="bottom"
                            openDelay={500}
                            label={
                                <Text fz="xs">
                                    Only filters added in <b>'edit'</b> mode
                                    will be saved
                                </Text>
                            }
                        >
                            <Button
                                size="xs"
                                variant="default"
                                leftIcon={
                                    <MantineIcon
                                        color="blue"
                                        icon={IconFilter}
                                    />
                                }
                                disabled={!hasChartTiles}
                                onClick={() =>
                                    setIsFilterPopoverOpen(
                                        (prevIsOpen) => !prevIsOpen,
                                    )
                                }
                            >
                                Add filter
                            </Button>
                        </Tooltip>
                    </Popover.Target>

                    <Popover.Dropdown ml={5} p={0}>
                        <FilterSearch
                            isEditMode={isEditMode}
                            fields={allFilterableFields || []}
                            popoverProps={{
                                usePortal: false,
                            }}
                            onClose={() => setIsFilterPopoverOpen(false)}
                        />
                    </Popover.Dropdown>
                </Popover>

                <ActiveFilters isEditMode={isEditMode} />
            </Flex>
        </FiltersProvider>
    );
};

export default DashboardFilter;
