import { Button, Tooltip } from '@mantine/core';
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
                    ? 'Close gaps and even out rows'
                    : 'Tiles are already tidy'
            }
        >
            <Button
                size="xs"
                variant="default"
                radius="md"
                leftSection={<MantineIcon icon={IconLayoutDashboard} />}
                disabled={!canTidy}
                onClick={() => dispatch(dashboardEditActions.tidyTiles())}
            >
                Tidy
            </Button>
        </Tooltip>
    );
});
TidyTilesButton.displayName = 'TidyTilesButton';
