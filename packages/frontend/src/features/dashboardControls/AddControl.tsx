import { Button } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import classes from './AddControl.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';

export const AddControl: FC = () => {
    const getUiString = useUiStrings();
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    // Same conditions as the shipped "Add filter": no picker before its fields
    const isDisabled = useDashboardContext(
        (c) => c.allFilterableFields === undefined,
    );
    const hasSqlColumns = useDashboardTileStatusContext(
        (c) => Object.keys(c.sqlChartTilesMetadata).length > 0,
    );
    const isLoading = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    return (
        <Button
            size="xs"
            variant="default"
            radius={100}
            className={classes.add}
            aria-label="Add filter or parameter"
            disabled={isDisabled && !hasSqlColumns}
            loading={isLoading}
            onClick={openNew}
        >
            {getUiString('filters.addFilter')}
        </Button>
    );
};
