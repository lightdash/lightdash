import {
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Text,
    Tooltip,
} from '@mantine-8/core';
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
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { DateZoom } from '../dateZoom';
import { Parameters } from '../parameters';
import FilterGroupSeparator from './FilterGroupSeparator';
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
                <div>
                    <Text fw={500} fz="xs">
                        Parameters
                    </Text>
                    <Text fz="xs">
                        Adjust preset inputs that change how the dashboard's
                        numbers are calculated.
                    </Text>
                </div>
            }
        />
    );

    const renderFilters = !isAddFilterDisabled || isEditMode || hasFilters;

    return (
        <div>
            <Group
                justify="apart"
                align="flex-start"
                wrap="nowrap"
                px="lg"
                py="xxs"
            >
                {/* Left section - filters and parameters */}
                <Group justify="apart" align="flex-start" wrap="nowrap" grow>
                    {hasTilesThatSupportFilters && (
                        <Group align="flex-start" gap="xs" wrap="wrap">
                            {renderFilters && (
                                <FilterGroupSeparator
                                    icon={IconFilter}
                                    tooltipLabel={
                                        <div>
                                            <Text fw={500} fz="xs">
                                                Filters
                                            </Text>
                                            <Text fz="xs">
                                                Refine your dashboard by
                                                choosing which data to see.
                                            </Text>
                                        </div>
                                    }
                                />
                            )}
                            <DashboardFilters
                                isEditMode={isEditMode}
                                activeTabUuid={activeTabUuid}
                            />

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
                                        separator={parametersSeparator}
                                    />
                                    <PinnedParameters isEditMode={isEditMode} />
                                </>
                            )}
                        </Group>
                    )}
                </Group>

                {/* Right section - date zoom and hide button */}
                <Group gap="xs" style={{ marginLeft: 'auto' }} wrap="nowrap">
                    {hasDashboardTiles &&
                        (!isDateZoomDisabled || isEditMode) && (
                            <>
                                <Divider orientation="vertical" />

                                <FilterGroupSeparator
                                    icon={IconCalendar}
                                    tooltipLabel={
                                        <div>
                                            <Text fw={500} fz="xs">
                                                Date Zoom
                                            </Text>
                                            <Text fz="xs">
                                                Quickly change the date
                                                granularity of charts.
                                            </Text>
                                        </div>
                                    }
                                />
                                {isEditMode && (
                                    <Tooltip
                                        withinPortal
                                        label={
                                            isDateZoomDisabled
                                                ? 'Date zoom is hidden from viewers. Click to show.'
                                                : 'Hide date zoom from viewers'
                                        }
                                    >
                                        <ActionIcon
                                            aria-label="Toggle date zoom visibility for viewers"
                                            variant="subtle"
                                            onClick={() =>
                                                setIsDateZoomDisabled(
                                                    !isDateZoomDisabled,
                                                )
                                            }
                                        >
                                            <MantineIcon
                                                color="ldGray.6"
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
                    {!isEditMode && (
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
};
