import { assertUnreachable } from '@lightdash/common';
import { SimpleGrid, Stack, Text } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { ResourceViewCommonProps } from '..';
import { useSpaces } from '../../../../hooks/useSpaces';
import { ResourceViewItemActionState } from '../ResourceActionHandlers';
import ResourceActionMenu from '../ResourceActionMenu';
import { ResourceViewItemType } from '../resourceTypeUtils';
import { getResourceName, getResourceUrl } from '../resourceUtils';
import ResourceViewGridChartItem from './ResourceViewGridChartItem';
import ResourceViewGridDashboardItem from './ResourceViewGridDashboardItem';
import ResourceViewGridSpaceItem from './ResourceViewGridSpaceItem';

type ResourceViewListProps = Pick<
    ResourceViewCommonProps,
    'items' | 'groups'
> & {
    onAction: (newAction: ResourceViewItemActionState) => void;
};

const ResourceViewList: FC<ResourceViewListProps> = ({
    items,
    groups = [
        [
            ResourceViewItemType.SPACE,
            ResourceViewItemType.DASHBOARD,
            ResourceViewItemType.CHART,
        ],
    ],
    onAction,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [] } = useSpaces(projectUuid);

    return (
        <Stack spacing="md" px="md" py="sm">
            {groups.map((group) => {
                const groupedItems = items.filter((item) =>
                    group.includes(item.type),
                );
                const heading = group
                    .map((g) => getResourceName(g) + 's')
                    .join(', ')
                    .replace(/, ([^,]*)$/, ' & $1'); // replaces last comma with '&'

                if (groupedItems.length === 0) {
                    return null;
                }

                return (
                    <Stack spacing={5} key={group.join('-')}>
                        {groups.length > 1 && (
                            <Text
                                transform="uppercase"
                                fz="xs"
                                fw="bold"
                                color="gray.6"
                            >
                                {heading}
                            </Text>
                        )}

                        <SimpleGrid cols={3} spacing="md">
                            {groupedItems.map((item) =>
                                item.type === ResourceViewItemType.SPACE ? (
                                    <ResourceViewGridSpaceItem
                                        url={getResourceUrl(projectUuid, item)}
                                        item={item}
                                        renderActions={() => (
                                            <ResourceActionMenu
                                                item={item}
                                                url={getResourceUrl(
                                                    projectUuid,
                                                    item,
                                                )}
                                                onAction={onAction}
                                                spaces={spaces}
                                            />
                                        )}
                                    />
                                ) : item.type ===
                                  ResourceViewItemType.DASHBOARD ? (
                                    <ResourceViewGridDashboardItem
                                        url={getResourceUrl(projectUuid, item)}
                                        item={item}
                                        renderActions={() => (
                                            <ResourceActionMenu
                                                item={item}
                                                url={getResourceUrl(
                                                    projectUuid,
                                                    item,
                                                )}
                                                onAction={onAction}
                                                spaces={spaces}
                                            />
                                        )}
                                    />
                                ) : item.type === ResourceViewItemType.CHART ? (
                                    <ResourceViewGridChartItem
                                        url={getResourceUrl(projectUuid, item)}
                                        item={item}
                                        renderActions={() => (
                                            <ResourceActionMenu
                                                item={item}
                                                url={getResourceUrl(
                                                    projectUuid,
                                                    item,
                                                )}
                                                onAction={onAction}
                                                spaces={spaces}
                                            />
                                        )}
                                    />
                                ) : (
                                    assertUnreachable(
                                        item,
                                        `Resource type not supported`,
                                    )
                                ),
                            )}
                        </SimpleGrid>
                    </Stack>
                );
            })}
        </Stack>
    );
};

export default ResourceViewList;
