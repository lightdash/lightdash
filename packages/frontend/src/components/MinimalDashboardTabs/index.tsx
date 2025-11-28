import type { DashboardTabWithUrls } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
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
        <Group p="xs" bg="white" sx={{ gap: '10px' }}>
            <ActionIcon
                size="md"
                color="blue.6"
                onClick={() => {
                    if (activeTab.prevUrl) {
                        void navigate(activeTab.prevUrl);
                    }
                }}
                disabled={!activeTab.prevUrl}
            >
                <MantineIcon icon={IconChevronLeft} size="lg" />
            </ActionIcon>
            <Group position="center" sx={{ flexGrow: 1 }}>
                <Tooltip
                    disabled={!isTruncated}
                    label={activeTab.name}
                    withinPortal
                    variant="xs"
                >
                    <Menu shadow="md">
                        <Menu.Target>
                            <Button
                                size="xs"
                                variant="subtle"
                                color="ldGray.8"
                                radius="md"
                                rightIcon={
                                    <MantineIcon icon={IconChevronDown} />
                                }
                            >
                                <Title
                                    ref={ref}
                                    order={6}
                                    fw={500}
                                    truncate
                                    maw="50vw"
                                >
                                    {activeTab.name}
                                </Title>
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown
                            w={200}
                            mah={200}
                            sx={(theme) => ({
                                overflowY: 'auto',
                                borderRadius: theme.radius.md,
                            })}
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
                                                ? 500
                                                : 400
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
                </Tooltip>
            </Group>
            <ActionIcon
                size="md"
                color="blue.6"
                onClick={() => {
                    if (activeTab.nextUrl) {
                        void navigate(activeTab.nextUrl);
                    }
                }}
                disabled={!activeTab.nextUrl}
            >
                <MantineIcon icon={IconChevronRight} size="lg" />
            </ActionIcon>
        </Group>
    );
};

export default MinimalDashboardTabs;
