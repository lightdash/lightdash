import type { DashboardTabWithUrls } from '@lightdash/common';
import { ActionIcon, Group, Menu, Text, Title, Tooltip } from '@mantine/core';
import {
    IconChevronLeft,
    IconChevronRight,
    IconMenu2,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import MantineIcon from '../common/MantineIcon';

const MinimalDashboardTabs = ({
    tabs,
    activeTabId,
}: {
    tabs: DashboardTabWithUrls[];
    activeTabId: string | null;
}) => {
    const navigate = useNavigate();
    const { ref, isTruncated } = useIsTruncated();

    const activeTab = tabs.find((tab) => tab.uuid === activeTabId) ?? tabs[0];

    return (
        <Group
            style={{ padding: '10px', backgroundColor: 'white', gap: '10px' }}
        >
            <ActionIcon
                size="md"
                color={'blue.6'}
                onClick={() => {
                    if (activeTab.prevUrl) {
                        void navigate(activeTab.prevUrl);
                    }
                }}
                disabled={!activeTab.prevUrl}
            >
                <MantineIcon icon={IconChevronLeft} size="lg" />
            </ActionIcon>
            <Group sx={{ flexGrow: 1, justifyContent: 'center' }}>
                <Tooltip
                    disabled={!isTruncated}
                    label={activeTab.name}
                    withinPortal
                    variant="xs"
                >
                    <Title ref={ref} order={6} fw={500} truncate maw="50vw">
                        {activeTab.name}
                    </Title>
                </Tooltip>
            </Group>
            <ActionIcon
                size="md"
                color={'blue.6'}
                onClick={() => {
                    if (activeTab.nextUrl) {
                        void navigate(activeTab.nextUrl);
                    }
                }}
                disabled={!activeTab.nextUrl}
            >
                <MantineIcon icon={IconChevronRight} size="lg" />
            </ActionIcon>
            <Menu shadow="md" width={200} position="bottom-end">
                <Menu.Target>
                    <ActionIcon size="md" color={'blue.6'}>
                        <MantineIcon icon={IconMenu2} size="lg" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown
                    sx={{
                        maxHeight: '200px',
                        overflowY: 'auto',
                    }}
                >
                    {tabs.map((tab) => (
                        <Menu.Item
                            key={tab.uuid}
                            onClick={() => {
                                void navigate(tab.selfUrl);
                            }}
                        >
                            <Text
                                fw={
                                    activeTab.uuid === tab.uuid
                                        ? 'bold'
                                        : 'normal'
                                }
                                truncate
                                maw="160px"
                            >
                                {tab.name}
                            </Text>
                        </Menu.Item>
                    ))}
                </Menu.Dropdown>
            </Menu>
        </Group>
    );
};

export default MinimalDashboardTabs;
