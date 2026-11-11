import { Box, Paper, SimpleGrid, Text } from '@mantine/core';
import { type FC } from 'react';
import { ControlsBar } from '../../features/dashboardControls/ControlsBar';
import { ControlsSidebarProvider } from '../../features/dashboardControls/ControlsSidebarProvider';
import { DateZoomTileOverlays } from '../../features/dashboardControls/DateZoomTileOverlay';
import { DateZoomTilesBar } from '../../features/dashboardControls/DateZoomTilesBar';
import { FilterBarPopoversProvider } from '../../features/dashboardFilters/FilterRequirements/FilterBarPopoversProvider';
import { tabs, tiles } from './fixtures';

const noop = () => {};

/** The dashboard bar with deterministic fields, tiles and saved controls. */
export const AddControlFlow: FC<{
    isEditMode?: boolean;
    /** The first tab's tiles under the bar, for choosing a date zoom's tiles. */
    withTiles?: boolean;
}> = ({ isEditMode = true, withTiles = false }) => (
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
        <Box aria-hidden={!withTiles} className="react-grid-layout" mih={120}>
            {withTiles && (
                <SimpleGrid cols={3} mt="md">
                    {tiles
                        .filter(({ tabUuid }) => tabUuid === tabs[0]?.uuid)
                        .map(({ uuid }) => (
                            <Paper
                                key={uuid}
                                data-tile-uuid={uuid}
                                h={160}
                                p="sm"
                                pos="relative"
                            >
                                <Text fz="xs" c="dimmed">
                                    {uuid}
                                </Text>
                            </Paper>
                        ))}
                </SimpleGrid>
            )}
        </Box>
        {withTiles && (
            <>
                <DateZoomTileOverlays />
                <DateZoomTilesBar />
            </>
        )}
    </ControlsSidebarProvider>
);
