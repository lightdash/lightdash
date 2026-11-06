import { SegmentedControl, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import styles from './EventAnalyticsSidebar.module.css';

type Tab<T extends string> = {
    value: T;
    label: string;
    content: ReactNode;
};

type Props<T extends string> = {
    title: string;
    tabs: Tab<T>[];
    activeTab: T;
    onTabChange: (tab: T) => void;
};

/** Sidebar with a tab switcher, shared by the event analytics builders. */
export const EventAnalyticsSidebar = <T extends string>({
    title,
    tabs,
    activeTab,
    onTabChange,
}: Props<T>) => {
    const active = tabs.find((tab) => tab.value === activeTab);
    return (
        <div className={styles.sidebar}>
            <Text fw={600}>{title}</Text>
            <SegmentedControl
                value={activeTab}
                onChange={(value) => {
                    const tab = tabs.find((t) => t.value === value);
                    if (tab) onTabChange(tab.value);
                }}
                data={tabs.map(({ value, label }) => ({ value, label }))}
                fullWidth
            />
            <div className={styles.sidebarContent}>{active?.content}</div>
        </div>
    );
};
