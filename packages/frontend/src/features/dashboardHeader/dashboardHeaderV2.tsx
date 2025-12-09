import {
    type Dashboard,
    type DashboardTab,
    type DashboardTile,
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { Flex, Group } from '@mantine/core';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { type Layout } from 'react-grid-layout';
import PinnedParameters from '../../components/PinnedParameters';
import DashboardFilter from '../dashboardFilters';
import DashboardTabs from '../dashboardTabs';
import { DateZoom } from '../dateZoom';
import { Parameters } from '../parameters';

type Props = {
    hasTilesThatSupportFilters: boolean;
    isEditMode: boolean;
    hasDashboardTiles: boolean | undefined;

    // parameters
    parameterValues: ParametersValuesMap;
    parameters: {
        [k: string]: LightdashProjectParameter;
    };
    isParameterLoading: boolean;
    missingRequiredParameters: string[];
    pinnedParameters: string[];
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onParameterClearAll: () => void;
    onParameterPin: (parameterKey: string) => void;
    hasRequiredDashboardFiltersToSet: boolean;

    // tabs
    activeTab: DashboardTab | undefined;
    addingTab: boolean;
    dashboardTiles: DashboardTile[] | undefined;
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => Promise<void>;
    onUpdateTiles: (layout: Layout[]) => Promise<void>;
    onDeleteTile: (tile: Dashboard['tiles'][number]) => Promise<void>;
    onBatchDeleteTiles: (tilesToDelete: Dashboard['tiles'][number][]) => void;
    onEditTile: (updatedTile: Dashboard['tiles'][number]) => void;
    setGridWidth: Dispatch<SetStateAction<number>>;
    setAddingTab: Dispatch<SetStateAction<boolean>>;
};

const DashboardHeaderV2: FC<Props> = ({
    hasTilesThatSupportFilters,
    isEditMode,
    hasDashboardTiles,
    // parameters
    isParameterLoading,
    missingRequiredParameters,
    onParameterChange,
    onParameterClearAll,
    onParameterPin,
    parameterValues,
    parameters,
    pinnedParameters,
    hasRequiredDashboardFiltersToSet,
    // tabs
    addingTab,
    dashboardTiles,
    onAddTiles,
    onUpdateTiles,
    onDeleteTile,
    onBatchDeleteTiles,
    onEditTile,
    setGridWidth,
    activeTab,
    setAddingTab,
}) => {
    return (
        <>
            <Group position="apart" align="flex-start" noWrap px={'lg'}>
                {/* This Group will take up remaining space (and not push DateZoom) */}
                <Group
                    position="apart"
                    align="flex-start"
                    noWrap
                    grow
                    sx={{
                        overflow: 'auto',
                    }}
                >
                    {hasTilesThatSupportFilters && (
                        <DashboardFilter
                            isEditMode={isEditMode}
                            activeTabUuid={activeTab?.uuid}
                        />
                    )}
                </Group>
                {/* DateZoom section will adjust width dynamically */}
                {hasDashboardTiles && (
                    <Group spacing="xs" style={{ marginLeft: 'auto' }}>
                        <DateZoom isEditMode={isEditMode} />
                    </Group>
                )}
            </Group>
            {hasDashboardTiles && (
                <Group spacing="xs" align="flex-start" noWrap px={'lg'}>
                    <Parameters
                        isEditMode={isEditMode}
                        parameterValues={parameterValues}
                        onParameterChange={onParameterChange}
                        onClearAll={onParameterClearAll}
                        parameters={parameters}
                        isLoading={isParameterLoading}
                        missingRequiredParameters={missingRequiredParameters}
                        pinnedParameters={pinnedParameters}
                        onParameterPin={onParameterPin}
                    />
                    <PinnedParameters isEditMode={isEditMode} />
                </Group>
            )}

            <Flex style={{ flexGrow: 1, flexDirection: 'column' }}>
                <DashboardTabs
                    isEditMode={isEditMode}
                    hasRequiredDashboardFiltersToSet={
                        hasRequiredDashboardFiltersToSet
                    }
                    addingTab={addingTab}
                    dashboardTiles={dashboardTiles}
                    handleAddTiles={onAddTiles}
                    handleUpdateTiles={onUpdateTiles}
                    handleDeleteTile={onDeleteTile}
                    handleBatchDeleteTiles={onBatchDeleteTiles}
                    handleEditTile={onEditTile}
                    setGridWidth={setGridWidth}
                    activeTab={activeTab}
                    setAddingTab={setAddingTab}
                />
            </Flex>
        </>
    );
};

export default DashboardHeaderV2;
