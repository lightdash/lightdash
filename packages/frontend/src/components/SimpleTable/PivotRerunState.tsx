import { Button } from '@mantine-8/core';
import { IconRefresh } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useExplorerQuery } from '../../hooks/useExplorerQuery';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const PivotRerunState: FC = () => {
    const { isLoading, fetchResults } = useExplorerQuery();
    const { track } = useTracking();

    const onClick = useCallback(() => {
        fetchResults();
        track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
    }, [fetchResults, track]);

    return (
        <SuboptimalState
            icon={IconRefresh}
            title="Run query to see your pivot table"
            description="You've changed the pivot configuration. Re-run the query to load the pivoted results."
            action={
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconRefresh} />}
                    loading={isLoading}
                    onClick={onClick}
                >
                    Run query
                </Button>
            }
        />
    );
};

export default PivotRerunState;
