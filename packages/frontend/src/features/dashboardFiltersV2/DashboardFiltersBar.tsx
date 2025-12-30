import {
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { Button, Divider, Group, Text, Tooltip } from '@mantine-8/core';
import {
    IconAdjustmentsHorizontal,
    IconCalendar,
    IconChevronUp,
    IconFilter,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import PinnedParameters from '../../components/PinnedParameters';
import MantineIcon from '../../components/common/MantineIcon';
import FilterGroupSeparator from '../dashboardHeader/FilterGroupSeparator';
import { DateZoomV2 } from '../dateZoomV2';
import { ParametersV2 } from '../parametersV2';
import DashboardFiltersV2 from './index';

type Props = {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    hasTilesThatSupportFilters: boolean;
    hasDashboardTiles: boolean;
    parameters: Record<string, LightdashProjectParameter>;
    parameterValues: ParametersValuesMap;
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onParameterClearAll: () => void;
    isParameterLoading: boolean;
    missingRequiredParameters: string[];
    pinnedParameters: string[];
    onParameterPin: (parameterKey: string) => void;
    isDateZoomDisabled: boolean;
    onCollapse: () => void;
};

export const DashboardFiltersBar: FC<Props> = ({
    isEditMode,
    activeTabUuid,
    hasTilesThatSupportFilters,
    hasDashboardTiles,
    parameters,
    parameterValues,
    onParameterChange,
    onParameterClearAll,
    isParameterLoading,
    missingRequiredParameters,
    pinnedParameters,
    onParameterPin,
    isDateZoomDisabled,
    onCollapse,
}) => {
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
                            <FilterGroupSeparator
                                icon={IconFilter}
                                tooltipLabel={
                                    <div>
                                        <Text fw={500} fz="xs">
                                            Filters
                                        </Text>
                                        <Text fz="xs">
                                            Refine your dashboard by choosing
                                            which data to see.
                                        </Text>
                                    </div>
                                }
                            />
                            <DashboardFiltersV2
                                isEditMode={isEditMode}
                                activeTabUuid={activeTabUuid}
                            />

                            {hasDashboardTiles && hasParameters && (
                                <>
                                    <Divider orientation="vertical" />

                                    <ParametersV2
                                        isEditMode={isEditMode}
                                        parameterValues={parameterValues}
                                        onParameterChange={onParameterChange}
                                        onClearAll={onParameterClearAll}
                                        parameters={parameters}
                                        isLoading={isParameterLoading}
                                        missingRequiredParameters={
                                            missingRequiredParameters
                                        }
                                        pinnedParameters={pinnedParameters}
                                        onParameterPin={onParameterPin}
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
                                <DateZoomV2 isEditMode={isEditMode} />
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
