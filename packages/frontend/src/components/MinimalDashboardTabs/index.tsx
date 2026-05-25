import { type DashboardTab } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
} from '@tabler/icons-react';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import MantineIcon from '../common/MantineIcon';
import styles from './MinimalDashboardTabs.module.css';

const MinimalDashboardTabs = ({
    tabs,
    activeTabId,
    onTabChange,
}: {
    tabs: DashboardTab[];
    activeTabId: string | null;
    onTabChange: (tabUuid: string) => void;
}) => {
    const { ref, isTruncated } = useIsTruncated();

    const activeTab = tabs.find((tab) => tab.uuid === activeTabId) ?? tabs[0];
    const activeTabIndex = tabs.findIndex((tab) => tab.uuid === activeTab.uuid);
    const previousTab = tabs[activeTabIndex - 1];
    const nextTab = tabs[activeTabIndex + 1];

    return (
        <Group p="xs" bg="background" gap={10} justify="space-between">
            <ActionIcon
                size="md"
                color="gray"
                onClick={() => {
                    if (previousTab) {
                        onTabChange(previousTab.uuid);
                    }
                }}
                disabled={!previousTab}
            >
                <MantineIcon icon={IconChevronLeft} size="lg" />
            </ActionIcon>
            <Group justify="center" flex={1}>
                <Tooltip disabled={!isTruncated} label={activeTab.name}>
                    <Menu shadow="md">
                        <Menu.Target>
                            <Button
                                size="xs"
                                variant="subtle"
                                color="ldGray.8"
                                radius="md"
                                rightSection={
                                    <MantineIcon icon={IconChevronDown} />
                                }
                            >
                                <Title ref={ref} order={6} fw={500} maw="50vw">
                                    <Text truncate="end">{activeTab.name}</Text>
                                </Title>
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown
                            className={styles.menuDropdown}
                            w={200}
                            mah={200}
                        >
                            {tabs.map((tab) => (
                                <Menu.Item
                                    key={tab.uuid}
                                    onClick={() => {
                                        onTabChange(tab.uuid);
                                    }}
                                >
                                    <Text
                                        fw={
                                            activeTab.uuid === tab.uuid
                                                ? 500
                                                : 400
                                        }
                                        truncate="end"
                                        maw="160px"
                                    >
                                        {tab.name}
                                    </Text>
                                </Menu.Item>
                            ))}
                        </Menu.Dropdown>
                    </Menu>
                </Tooltip>
            </Group>
            <ActionIcon
                size="md"
                color="gray"
                onClick={() => {
                    if (nextTab) {
                        onTabChange(nextTab.uuid);
                    }
                }}
                disabled={!nextTab}
            >
                <MantineIcon icon={IconChevronRight} size="lg" />
            </ActionIcon>
        </Group>
    );
};

export default MinimalDashboardTabs;
