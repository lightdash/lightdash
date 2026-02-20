import {
    Box,
    Button,
    Center,
    Collapse,
    getDefaultZIndex,
    Loader,
    Menu,
    ScrollArea,
    Text,
} from '@mantine-8/core';
import {
    IconCategory,
    IconChartAreaLine,
    IconChevronDown,
    IconChevronRight,
    IconFolder,
    IconFolders,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { Link } from 'react-router';
import {
    ResourceViewItemType,
    assertUnreachable,
    type ResourceViewItem,
} from '@lightdash/common';
import { useHasMetricsInCatalog } from '../../features/metricsCatalog/hooks/useMetricsCatalog';
import { useFavorites } from '../../hooks/favorites/useFavorites';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import MantineIcon from '../common/MantineIcon';
import { PolymorphicGroupButton } from '../common/PolymorphicGroupButton';
import TruncatedText from '../common/TruncatedText';
import { MetricsLink } from './MetricsLink';

interface Props {
    projectUuid: string;
}

const getFavoriteItemUrl = (projectUuid: string, item: ResourceViewItem) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${item.data.uuid}/view`;
        case ResourceViewItemType.CHART:
            return `/projects/${projectUuid}/saved/${item.data.uuid}`;
        case ResourceViewItemType.SPACE:
            return `/projects/${projectUuid}/spaces/${item.data.uuid}`;
        default:
            return assertUnreachable(item, `Unknown favorite item type`);
    }
};

const getFavoriteItemIcon = (item: ResourceViewItem) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return IconLayoutDashboard;
        case ResourceViewItemType.CHART:
            return IconChartAreaLine;
        case ResourceViewItemType.SPACE:
            return IconFolder;
        default:
            return assertUnreachable(item, `Unknown favorite item type`);
    }
};

const BrowseMenu: FC<Props> = ({ projectUuid }) => {
    // Track if menu has ever been opened to defer loading spaces
    const [hasBeenOpened, setHasBeenOpened] = useState(false);
    const [spacesExpanded, setSpacesExpanded] = useState(false);

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
    const { data: favorites } = useFavorites(projectUuid);

    const hasFavorites = favorites && favorites.length > 0;
    const hasSpaces = isInitialLoading || (spaces && spaces.length > 0);

    return (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-start"
            arrowOffset={16}
            offset={-2}
            zIndex={getDefaultZIndex('max')}
            portalProps={{ target: '#navbar-header' }}
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
                    leftSection={
                        <MantineIcon color="ldGray.6" icon={IconCategory} />
                    }
                >
                    Browse
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUuid}/spaces`}
                    leftSection={<MantineIcon icon={IconFolders} />}
                >
                    All Spaces
                </Menu.Item>

                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUuid}/dashboards`}
                    leftSection={<MantineIcon icon={IconLayoutDashboard} />}
                >
                    All dashboards
                </Menu.Item>

                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUuid}/saved`}
                    leftSection={<MantineIcon icon={IconChartAreaLine} />}
                >
                    All saved charts
                </Menu.Item>

                {!hasMetrics && (
                    <MetricsLink projectUuid={projectUuid} asMenu />
                )}

                {hasFavorites ? (
                    <>
                        <Menu.Divider />
                        <Menu.Label>Favorites</Menu.Label>
                        <ScrollArea
                            variant="primary"
                            className="only-vertical"
                            scrollbarSize={6}
                            type="hover"
                        >
                            <Box mah={200}>
                                {favorites.map((item) => (
                                    <Menu.Item
                                        key={item.data.uuid}
                                        component={Link}
                                        to={getFavoriteItemUrl(
                                            projectUuid,
                                            item,
                                        )}
                                        leftSection={
                                            <MantineIcon
                                                icon={getFavoriteItemIcon(item)}
                                            />
                                        }
                                    >
                                        <TruncatedText maxWidth={200}>
                                            {item.data.name}
                                        </TruncatedText>
                                    </Menu.Item>
                                ))}
                            </Box>
                        </ScrollArea>
                    </>
                ) : null}

                {hasSpaces ? (
                    <>
                        <Menu.Divider />
                        <PolymorphicGroupButton
                            component="div"
                            w="100%"
                            px="sm"
                            py={6}
                            gap="xs"
                            justify="space-between"
                            onClick={() =>
                                setSpacesExpanded((prev) => !prev)
                            }
                        >
                            <Text fz="xs" fw={500} c="dimmed">
                                Spaces
                            </Text>
                            <MantineIcon
                                color="ldGray.6"
                                size={14}
                                icon={
                                    spacesExpanded
                                        ? IconChevronDown
                                        : IconChevronRight
                                }
                            />
                        </PolymorphicGroupButton>

                        <Collapse in={spacesExpanded}>
                            {isInitialLoading ? (
                                <Center my="sm">
                                    <Loader size="sm" color="gray" />
                                </Center>
                            ) : (
                                <ScrollArea
                                    variant="primary"
                                    className="only-vertical"
                                    scrollbarSize={6}
                                    type="hover"
                                >
                                    <Box mah={300}>
                                        {spaces
                                            ?.sort((a, b) =>
                                                a.name.localeCompare(b.name),
                                            )
                                            .map((space) => (
                                                <Menu.Item
                                                    key={space.uuid}
                                                    component={Link}
                                                    to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconFolder}
                                                        />
                                                    }
                                                >
                                                    <TruncatedText maxWidth={200}>
                                                        {space.name}
                                                    </TruncatedText>
                                                </Menu.Item>
                                            ))}
                                    </Box>
                                </ScrollArea>
                            )}
                        </Collapse>
                    </>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    );
};
export default BrowseMenu;
