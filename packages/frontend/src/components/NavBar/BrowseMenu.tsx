import { Box, Button, Center, Loader, Menu, ScrollArea } from '@mantine/core';
import {
    IconCategory,
    IconChartAreaLine,
    IconFolder,
    IconFolders,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { Link } from 'react-router';
import { useHasMetricsInCatalog } from '../../features/metricsCatalog/hooks/useMetricsCatalog';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import MantineIcon from '../common/MantineIcon';
import { MetricsLink } from './MetricsLink';

interface Props {
    projectUuid: string;
}

const BrowseMenu: FC<Props> = ({ projectUuid }) => {
    // Track if menu has ever been opened to defer loading spaces
    const [hasBeenOpened, setHasBeenOpened] = useState(false);

    const { data: spaces, isInitialLoading } = useSpaceSummaries(
        projectUuid,
        true,
        {
            select: (data) => data.filter((space) => !space.parentSpaceUuid),
            enabled: hasBeenOpened,
        },
    );
    const { data: hasMetrics } = useHasMetricsInCatalog({
        projectUuid,
    });

    return (
        <Menu
            withArrow
            withinPortal
            shadow="lg"
            position="bottom-start"
            arrowOffset={16}
            offset={-2}
            onChange={(opened) => {
                if (opened && !hasBeenOpened) {
                    setHasBeenOpened(true);
                }
            }}
        >
            <Menu.Target>
                <Button
                    variant="default"
                    size="xs"
                    fz="sm"
                    leftIcon={
                        <MantineIcon color="#adb5bd" icon={IconCategory} />
                    }
                >
                    Browse
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUuid}/spaces`}
                    icon={<MantineIcon icon={IconFolders} />}
                >
                    All Spaces
                </Menu.Item>

                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUuid}/dashboards`}
                    icon={<MantineIcon icon={IconLayoutDashboard} />}
                >
                    All dashboards
                </Menu.Item>

                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUuid}/saved`}
                    icon={<MantineIcon icon={IconChartAreaLine} />}
                >
                    All saved charts
                </Menu.Item>

                {!hasMetrics && (
                    <MetricsLink projectUuid={projectUuid} asMenu />
                )}

                {isInitialLoading || (spaces && spaces.length > 0) ? (
                    <>
                        <Menu.Divider />
                        <Menu.Label>Spaces</Menu.Label>

                        {isInitialLoading ? (
                            <Center my="sm">
                                <Loader size="sm" color="gray" />
                            </Center>
                        ) : null}
                    </>
                ) : null}

                <ScrollArea
                    variant="primary"
                    className="only-vertical"
                    scrollbarSize={6}
                    type="hover"
                >
                    <Box mah={300}>
                        {spaces
                            ?.sort((a, b) => a.name.localeCompare(b.name))
                            .map((space) => (
                                <Menu.Item
                                    key={space.uuid}
                                    component={Link}
                                    to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                                    icon={<MantineIcon icon={IconFolder} />}
                                >
                                    {space.name}
                                </Menu.Item>
                            ))}
                    </Box>
                </ScrollArea>
            </Menu.Dropdown>
        </Menu>
    );
};
export default BrowseMenu;
