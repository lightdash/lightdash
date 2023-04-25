import { DashboardTileTypes } from '@lightdash/common';
import { Button, Group, Popover, Text, Tooltip } from '@mantine/core';
import { IconFilterPlus } from '@tabler/icons-react';
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
        dashboardFilters,
        fieldsWithSuggestions,
        dashboardTiles,
        allFilterableFields,
    } = useDashboardContext();

    const hasChartTiles =
        dashboardTiles.filter(
            (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
        ).length >= 1;

    const handleOpen = () => {
        setIsSubmenuOpen(false);
        setIsOpen(true);
    };

    const handleClose = () => {
        setIsSubmenuOpen((submenuOpenState) => {
            if (!submenuOpenState) setIsOpen(false);
            return false;
        });
    };

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            fieldsMap={fieldsWithSuggestions}
            startOfWeek={project.data?.warehouseConnection?.startOfWeek}
        >
            <Group spacing="sm" mb="xs" align="flex-start" noWrap>
                <Popover
                    opened={isOpen}
                    onOpen={() => handleOpen()}
                    onClose={() => handleClose()}
                    trapFocus
                    disabled={!hasChartTiles}
                    closeOnEscape={!isSubmenuOpen}
                    closeOnClickOutside={!isSubmenuOpen}
                    position="bottom-start"
                    shadow="lg"
                    withArrow
                    arrowSize={14}
                    arrowOffset={10}
                >
                    <Popover.Dropdown>
                        <FilterSearch
                            isEditMode={isEditMode}
                            fields={allFilterableFields || []}
                            popoverProps={{
                                onOpen: () => setIsSubmenuOpen(true),
                                onClose: () => setIsSubmenuOpen(false),
                            }}
                        />
                    </Popover.Dropdown>

                    <Popover.Target>
                        <Tooltip
                            disabled={isOpen || isEditMode}
                            withArrow
                            position="top-start"
                            label={
                                <>
                                    Only filters added in{' '}
                                    <Text component="span" w="600">
                                        'edit'
                                    </Text>{' '}
                                    mode will be saved
                                </>
                            }
                        >
                            <Button
                                variant="subtle"
                                compact
                                onClick={() => setIsOpen((value) => !value)}
                                leftIcon={
                                    <MantineIcon
                                        icon={IconFilterPlus}
                                        size="md"
                                    />
                                }
                                disabled={!hasChartTiles}
                            >
                                Add filter
                            </Button>
                        </Tooltip>
                    </Popover.Target>
                </Popover>

                {dashboardFilters && <ActiveFilters isEditMode={isEditMode} />}
            </Group>
        </FiltersProvider>
    );
};

export default DashboardFilter;
