import {
    DashboardFieldTarget,
    DashboardFilterRule,
    DashboardTileTypes,
    FilterableField,
    FilterOperator,
} from '@lightdash/common';
import { Button, Flex, Popover, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconFilter } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '../../hooks/useProject';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import MantineIcon from '../common/MantineIcon';
import ActiveFilters from './ActiveFilters';
import FilterConfiguration from './FilterConfiguration';

interface Props {
    isEditMode: boolean;
}

const DashboardFilter: FC<Props> = ({ isEditMode }) => {
    const { track } = useTracking();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [selectedField, setSelectedField] = useState<FilterableField>();
    const [isPopoverOpen, { close: closePopover, toggle: togglePopover }] =
        useDisclosure();
    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const project = useProject(projectUuid);
    const {
        allFilters,
        fieldsWithSuggestions,
        dashboardTiles,
        allFilterableFields,
        filterableFieldsByTileUuid,
        addDimensionDashboardFilter,
    } = useDashboardContext();

    const [draftFilterRule, setDraftFilterRule] = useState<
        DashboardFilterRule | undefined
    >();

    const handleSetDraftFilterRule = (newRule?: DashboardFilterRule) =>
        setDraftFilterRule(newRule);

    const handleClose = useCallback(() => {
        setSelectedField(undefined);
        setDraftFilterRule(undefined);
        closeSubPopover();
        closePopover();
    }, [closeSubPopover, closePopover]);

    const handleSave = (
        value: DashboardFilterRule<
            FilterOperator,
            DashboardFieldTarget,
            any,
            any
        >,
    ) => {
        track({
            name: EventName.ADD_FILTER_CLICKED,
            properties: {
                mode: isEditMode ? 'edit' : 'viewer',
            },
        });
        addDimensionDashboardFilter(value, !isEditMode);
        handleClose();
    };

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
                    opened={isPopoverOpen}
                    closeOnEscape={!isSubPopoverOpen}
                    closeOnClickOutside={!isSubPopoverOpen}
                    onClose={handleClose}
                    disabled={!hasChartTiles}
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
                            disabled={isPopoverOpen || isEditMode}
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
                                onClick={togglePopover}
                            >
                                Add filter
                            </Button>
                        </Tooltip>
                    </Popover.Target>

                    <Popover.Dropdown ml={5}>
                        {filterableFieldsByTileUuid ? (
                            <FilterConfiguration
                                isCreatingNew
                                isEditMode={isEditMode}
                                field={selectedField}
                                fields={allFilterableFields || []}
                                onFieldChange={setSelectedField}
                                tiles={dashboardTiles}
                                availableTileFilters={
                                    filterableFieldsByTileUuid
                                }
                                draftFilterRule={draftFilterRule}
                                onChangeDraftFilterRule={
                                    handleSetDraftFilterRule
                                }
                                onSave={handleSave}
                                // FIXME: remove this once we migrate off of Blueprint
                                popoverProps={{
                                    onOpened: () => openSubPopover(),
                                    onOpening: () => openSubPopover(),
                                    onClose: () => closeSubPopover(),
                                    onClosing: () => closeSubPopover(),
                                }}
                            />
                        ) : null}
                    </Popover.Dropdown>
                </Popover>

                <ActiveFilters isEditMode={isEditMode} />
            </Flex>
        </FiltersProvider>
    );
};

export default DashboardFilter;
