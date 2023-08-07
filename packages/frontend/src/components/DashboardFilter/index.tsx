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
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

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

    const handleClose = () => {
        setIsSubmenuOpen(false);
        setIsOpen(false);
    };

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            fieldsMap={fieldsWithSuggestions}
            startOfWeek={project.data?.warehouseConnection?.startOfWeek}
            dashboardFilters={allFilters}
        >
            <Flex gap={3} mb={2}>
                <Popover
                    disabled={!hasChartTiles}
                    onOpen={() => setIsOpen(true)}
                    onClose={handleClose}
                    closeOnEscape={!isSubmenuOpen}
                    transitionProps={{
                        transition: 'pop',
                    }}
                    withArrow
                    shadow="md"
                    offset={-1}
                >
                    <Popover.Target>
                        <Tooltip
                            disabled={isOpen || isEditMode}
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
                                onOpened: () => setIsSubmenuOpen(true),
                                onOpening: () => setIsSubmenuOpen(true),
                                onClose: () => setIsSubmenuOpen(false),
                                onClosing: () => setIsSubmenuOpen(false),
                                usePortal: false,
                            }}
                            onClose={handleClose}
                            onSelectField={handleClose}
                        />
                    </Popover.Dropdown>
                </Popover>

                <ActiveFilters isEditMode={isEditMode} />
            </Flex>
        </FiltersProvider>
    );
};

export default DashboardFilter;
