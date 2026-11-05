import { SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
    selectActiveTab,
    setActiveTab,
    type RetentionSidebarTab,
} from '../store/retentionBuilderSlice';
import styles from './RetentionBuilderSidebar.module.css';
import { RetentionFieldsTab } from './RetentionFieldsTab';
import { RetentionSettingsTab } from './RetentionSettingsTab';

type Props = {
    projectUuid: string;
};

const isTab = (value: string): value is RetentionSidebarTab =>
    value === 'fields' || value === 'retention';

export const RetentionBuilderSidebar: FC<Props> = ({ projectUuid }) => {
    const dispatch = useAppDispatch();
    const activeTab = useAppSelector(selectActiveTab);

    return (
        <div className={styles.sidebar}>
            <Text fw={600}>Retention Builder</Text>

            <SegmentedControl
                value={activeTab}
                onChange={(value) => {
                    if (isTab(value)) dispatch(setActiveTab(value));
                }}
                data={[
                    { value: 'fields', label: 'Fields' },
                    { value: 'retention', label: 'Retention' },
                ]}
                fullWidth
            />

            <div className={styles.sidebarContent}>
                {activeTab === 'fields' ? (
                    <RetentionFieldsTab projectUuid={projectUuid} />
                ) : (
                    <RetentionSettingsTab />
                )}
            </div>
        </div>
    );
};
