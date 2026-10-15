import { SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../store';
import {
    selectActiveTab,
    setActiveTab,
    type SidebarTab,
} from '../store/funnelBuilderSlice';
import styles from './FunnelBuilderSidebar.module.css';
import { FunnelFieldsTab } from './FunnelFieldsTab';
import { FunnelStepsTab } from './FunnelStepsTab';

type Props = {
    projectUuid: string;
};

export const FunnelBuilderSidebar: FC<Props> = ({ projectUuid }) => {
    const { t } = useTranslation('metricsCatalog');
    const dispatch = useAppDispatch();
    const activeTab = useAppSelector(selectActiveTab);

    return (
        <div className={styles.sidebar}>
            <Text fw={600}>{t('funnelBuilder.title')}</Text>

            <SegmentedControl
                value={activeTab}
                onChange={(value) =>
                    dispatch(setActiveTab(value as SidebarTab))
                }
                data={[
                    { value: 'fields', label: t('funnelBuilder.tabs.fields') },
                    { value: 'steps', label: t('funnelBuilder.tabs.steps') },
                ]}
                fullWidth
            />

            <div className={styles.sidebarContent}>
                {activeTab === 'fields' ? (
                    <FunnelFieldsTab projectUuid={projectUuid} />
                ) : (
                    <FunnelStepsTab />
                )}
            </div>
        </div>
    );
};
