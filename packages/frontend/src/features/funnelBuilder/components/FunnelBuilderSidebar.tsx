import { SegmentedControl, Text } from '@mantine-8/core';
import { type FC } from 'react';
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
    const dispatch = useAppDispatch();
    const activeTab = useAppSelector(selectActiveTab);

    return (
        <div className={styles.sidebar}>
            <Text fw={600}>Funnel Builder</Text>

            <SegmentedControl
                value={activeTab}
                onChange={(value) =>
                    dispatch(setActiveTab(value as SidebarTab))
                }
                data={[
                    { value: 'fields', label: 'Fields' },
                    { value: 'steps', label: 'Steps' },
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
