import { Button } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useExplorerQuery } from '../../hooks/useExplorerQuery';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const PivotRerunState: FC = () => {
    const { t } = useTranslation('visualization');
    const { isLoading, fetchResults } = useExplorerQuery();
    const { track } = useTracking();

    const onClick = useCallback(() => {
        fetchResults();
        track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
    }, [fetchResults, track]);

    return (
        <SuboptimalState
            icon={IconRefresh}
            title={t('table.pivotRerun.title')}
            description={t('table.pivotRerun.description')}
            action={
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconRefresh} />}
                    loading={isLoading}
                    onClick={onClick}
                >
                    {t('table.pivotRerun.runQuery')}
                </Button>
            }
        />
    );
};

export default PivotRerunState;
