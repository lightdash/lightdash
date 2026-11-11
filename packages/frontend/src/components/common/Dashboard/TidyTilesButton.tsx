import { ActionIcon, Tooltip } from '@mantine/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { memo } from 'react';
import {
    dashboardEditActions,
    selectCanTidyTiles,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import MantineIcon from '../MantineIcon';

export const TidyTilesButton = memo(() => {
    const dispatch = useDashboardDispatch();
    const canTidy = useDashboardSelector(selectCanTidyTiles);

    return (
        <Tooltip
            label={
                canTidy
                    ? 'Tidy: close gaps and even out rows'
                    : 'Tiles are already tidy'
            }
        >
            <ActionIcon
                size="md"
                aria-label="Tidy tiles"
                disabled={!canTidy}
                onClick={() => dispatch(dashboardEditActions.tidyTiles())}
            >
                <MantineIcon icon={IconLayoutDashboard} />
            </ActionIcon>
        </Tooltip>
    );
});
TidyTilesButton.displayName = 'TidyTilesButton';
