import {
    type Dashboard,
    type DashboardTab,
    type DashboardTile,
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { type Layout } from 'react-grid-layout';
import DashboardTabsV2 from '../dashboardTabsV2';

type Props = {
    isEditMode: boolean;
    // parameters
    hasTilesThatSupportFilters: boolean;
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
    isEditMode,
    // parameters
    hasTilesThatSupportFilters,
    isParameterLoading,
    missingRequiredParameters,
    onParameterChange,
    onParameterClearAll,
    onParameterPin,
    parameterValues,
    parameters,
    pinnedParameters,
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
        <DashboardTabsV2
            isEditMode={isEditMode}
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
            hasTilesThatSupportFilters={hasTilesThatSupportFilters}
            isParameterLoading={isParameterLoading}
            missingRequiredParameters={missingRequiredParameters}
            onParameterChange={onParameterChange}
            onParameterClearAll={onParameterClearAll}
            onParameterPin={onParameterPin}
            parameterValues={parameterValues}
            parameters={parameters}
            pinnedParameters={pinnedParameters}
        />
    );
};

export default DashboardHeaderV2;
