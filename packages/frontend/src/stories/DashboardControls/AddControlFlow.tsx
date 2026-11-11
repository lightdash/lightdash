import { Box } from '@mantine/core';
import { type FC } from 'react';
import { ControlsBar } from '../../features/dashboardControls/ControlsBar';
import { ControlsSidebarProvider } from '../../features/dashboardControls/ControlsSidebarProvider';
import { FilterBarPopoversProvider } from '../../features/dashboardFilters/FilterRequirements/FilterBarPopoversProvider';
import { tabs } from './fixtures';

const noop = () => {};

/** The dashboard bar with deterministic fields, tiles and saved controls. */
export const AddControlFlow: FC<{ isEditMode?: boolean }> = ({
    isEditMode = true,
}) => (
    <ControlsSidebarProvider isEditMode={isEditMode}>
        <FilterBarPopoversProvider>
            <ControlsBar
                isEditMode={isEditMode}
                activeTabUuid={tabs[0]?.uuid}
                hasTilesThatSupportFilters
                hasDashboardTiles
                parameters={{}}
                shadowedReservedNames={[]}
                parameterValues={{}}
                onParameterChange={noop}
                onParameterClearAll={noop}
                isParameterLoading={false}
                missingRequiredParameters={[]}
                pinnedParameters={[]}
                onParameterPin={noop}
                parameterOrder={[]}
                onParameterReorder={noop}
                isDateZoomDisabled
                onCollapse={noop}
            />
        </FilterBarPopoversProvider>
        <Box aria-hidden className="react-grid-layout" mih={120} />
    </ControlsSidebarProvider>
);
