import { FeatureFlags } from '@lightdash/common';
import { Center, Loader } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { QueryHistoryPage } from '../features/queryHistory';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

const QueryHistory: FC = () => {
    const { t } = useTranslation('pages');
    const queryHistoryFlag = useServerFeatureFlag(FeatureFlags.QueryHistory);

    if (queryHistoryFlag.isInitialLoading) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    if (!queryHistoryFlag.data?.enabled) {
        return <ForbiddenPanel subject={t('queryHistory.forbiddenSubject')} />;
    }

    return <QueryHistoryPage />;
};

export default QueryHistory;
