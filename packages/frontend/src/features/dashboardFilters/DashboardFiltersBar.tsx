import {
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Drawer,
    useMatches,
    Group,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAdjustmentsHorizontal,
    IconCalendar,
    IconChevronUp,
    IconEye,
    IconEyeOff,
    IconFilter,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import PinnedParameters from '../../components/PinnedParameters';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { DateZoom } from '../dateZoom';
import { Parameters } from '../parameters';
import classes from './DashboardFiltersBar.module.css';
import FilterGroupSeparator from './FilterGroupSeparator';
import FilterRequirementsButton from './FilterRequirements/FilterRequirementsButton';
import DashboardFilters from './index';

type Props = {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    hasTilesThatSupportFilters: boolean;
    hasDashboardTiles: boolean;
    parameters: Record<string, LightdashProjectParameter>;
    shadowedReservedNames: string[];
    parameterValues: ParametersValuesMap;
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onParameterClearAll: () => void;
    isParameterLoading: boolean;
    missingRequiredParameters: string[];
    pinnedParameters: string[];
    onParameterPin: (parameterKey: string) => void;
    parameterOrder: string[];
    onParameterReorder: (order: string[]) => void;
    isDateZoomDisabled: boolean;
    onCollapse: () => void;
};

export const DashboardFiltersBar: FC<Props> = ({
    isEditMode,
    activeTabUuid,
    hasTilesThatSupportFilters,
    hasDashboardTiles,
    parameters,
    shadowedReservedNames,
    parameterValues,
    onParameterChange,
    onParameterClearAll,
    isParameterLoading,
    missingRequiredParameters,
    pinnedParameters,
    onParameterPin,
    parameterOrder,
    onParameterReorder,
    isDateZoomDisabled,
    onCollapse,
}) => {
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    const [opened, { open, close }] = useDisclosure(false);
    const getUiString = useUiStrings();
    const isAddFilterDisabled = useDashboardContext(
        (c) => c.isAddFilterDisabled,
    );
    const allFilters = useDashboardContext((c) => c.allFilters);
    const setIsDateZoomDisabled = useDashboardContext(
        (c) => c.setIsDateZoomDisabled,
    );
    const hasFilters =
        allFilters.dimensions.length > 0 ||
        allFilters.metrics.length > 0 ||
        allFilters.tableCalculations.length > 0;
    const hasParameters = Object.keys(parameters).length > 0;

    const parametersSeparator: ReactNode = (
        <FilterGroupSeparator
            icon={IconAdjustmentsHorizontal}
            tooltipLabel={
                <Box>
                    <Text fw={500} fz="xs">
                        Parameters
                    </Text>
                    <Text fz="xs">
                        Adjust preset inputs that change how the dashboard's
                        numbers are calculated.
                    </Text>
                </Box>
            }
        />
    );

    const renderFilters = !isAddFilterDisabled || isEditMode || hasFilters;

    const content = (
        <div className={classes.content}>
            <Group
                className={classes.bar}
                justify="space-between"
                align="flex-start"
                wrap={compact ? 'wrap' : 'nowrap'}
                px="lg"
                py="xxs"
                // Walkthrough: a look at the filter bar on the way to the
                // date zoom (view:Dashboard). See scripts/scope-tours.
                data-tour-scope="view:Dashboard"
                data-tour-look="1"
                data-tour-after='[data-tour-anchor="dashboard-row"][data-tour-value="Jaffle Shop overview"]'
                data-tour-label="Filters sit at the top"
                data-tour-docs="explore/dashboards/interact.mdx#filter-the-dashboard:1-2"
            >
                {/* Left section - filters and parameters */}
                <Group
                    justify="space-between"
                    align="flex-start"
                    wrap={compact ? 'wrap' : 'nowrap'}
                    grow
                >
                    {hasTilesThatSupportFilters && (
                        <Group
                            className={classes.filters}
                            align="flex-start"
                            gap="xs"
                            wrap="wrap"
                        >
                            {renderFilters && (
                                <FilterGroupSeparator
                                    icon={IconFilter}
                                    tooltipLabel={
                                        <Box>
                                            <Text fw={500} fz="xs">
                                                Filters
                                            </Text>
                                            <Text fz="xs">
                                                Refine your dashboard by
                                                choosing which data to see.
                                            </Text>
                                        </Box>
                                    }
                                />
                            )}
                            <DashboardFilters
                                isEditMode={isEditMode}
                                activeTabUuid={activeTabUuid}
                            />

                            {isEditMode && <FilterRequirementsButton />}

                            {hasDashboardTiles && hasParameters && (
                                <>
                                    {renderFilters && (
                                        <Divider orientation="vertical" />
                                    )}

                                    <Parameters
                                        isEditMode={isEditMode}
                                        parameterValues={parameterValues}
                                        onParameterChange={onParameterChange}
                                        onClearAll={onParameterClearAll}
                                        parameters={parameters}
                                        shadowedReservedNames={
                                            shadowedReservedNames
                                        }
                                        isLoading={isParameterLoading}
                                        missingRequiredParameters={
                                            missingRequiredParameters
                                        }
                                        pinnedParameters={pinnedParameters}
                                        onParameterPin={onParameterPin}
                                        parameterOrder={parameterOrder}
                                        onParameterReorder={onParameterReorder}
                                        separator={
                                            compact
                                                ? undefined
                                                : parametersSeparator
                                        }
                                    />
                                    <PinnedParameters isEditMode={isEditMode} />
                                </>
                            )}
                        </Group>
                    )}
                </Group>

                {/* Right section - date zoom and hide button */}
                <Group gap="xs" ml="auto" wrap={compact ? 'wrap' : 'nowrap'}>
                    {hasDashboardTiles &&
                        (!isDateZoomDisabled || isEditMode) && (
                            <>
                                <Divider orientation="vertical" />

                                <FilterGroupSeparator
                                    icon={IconCalendar}
                                    tooltipLabel={
                                        <Box>
                                            <Text fw={500} fz="xs">
                                                Date Zoom
                                            </Text>
                                            <Text fz="xs">
                                                Quickly change the date
                                                granularity of charts.
                                            </Text>
                                        </Box>
                                    }
                                />
                                {isEditMode && (
                                    <Tooltip
                                        label={
                                            isDateZoomDisabled
                                                ? 'Date zoom is hidden from viewers. Click to show.'
                                                : 'Hide date zoom from viewers'
                                        }
                                    >
                                        <ActionIcon
                                            aria-label="Toggle date zoom visibility for viewers"
                                            onClick={() =>
                                                setIsDateZoomDisabled(
                                                    !isDateZoomDisabled,
                                                )
                                            }
                                        >
                                            <MantineIcon
                                                color="dimmed"
                                                icon={
                                                    isDateZoomDisabled
                                                        ? IconEyeOff
                                                        : IconEye
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                                <DateZoom isEditMode={isEditMode} />
                            </>
                        )}

                    {/* Hide button - only in view mode */}
                    {!isEditMode && !compact && (
                        <>
                            <Divider orientation="vertical" />
                            <Tooltip label="Hide filters">
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    color="gray"
                                    rightSection={
                                        <MantineIcon icon={IconChevronUp} />
                                    }
                                    onClick={onCollapse}
                                >
                                    Hide
                                </Button>
                            </Tooltip>
                        </>
                    )}
                </Group>
            </Group>
        </div>
    );

    if (!compact || isEditMode) return content;

    return (
        <Box px="sm" py="xs">
            <Button
                variant="default"
                onClick={open}
                leftSection={<MantineIcon icon={IconFilter} />}
                aria-expanded={opened}
            >
                {getUiString('filters.panel.title')}
            </Button>
            <Drawer
                opened={opened}
                onClose={close}
                title={getUiString('filters.panel.title')}
                closeButtonProps={{
                    'aria-label': getUiString('filters.panel.close'),
                    size: 44,
                }}
                position="bottom"
                size="85dvh"
                classNames={{
                    content: classes.drawerContent,
                    body: classes.drawerBody,
                }}
            >
                {content}
            </Drawer>
        </Box>
    );
};
