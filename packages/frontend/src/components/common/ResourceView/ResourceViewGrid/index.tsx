import { assertUnreachable } from '@lightdash/common';
import { Anchor, SimpleGrid, Stack, Text } from '@mantine/core';
import { FC } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ResourceViewCommonProps } from '..';
import { useSpaces } from '../../../../hooks/useSpaces';
import { ResourceViewItemActionState } from '../ResourceActionHandlers';
import ResourceActionMenu from '../ResourceActionMenu';
import { ResourceViewItemType } from '../resourceTypeUtils';
import { getResourceName, getResourceUrl } from '../resourceUtils';
import ResourceViewGridChartItem from './ResourceViewGridChartItem';
import ResourceViewGridDashboardItem from './ResourceViewGridDashboardItem';
import ResourceViewGridSpaceItem from './ResourceViewGridSpaceItem';

export interface ResourceViewGridCommonProps {
    groups?: ResourceViewItemType[][];
}

type ResourceViewGridProps = ResourceViewGridCommonProps &
    Pick<ResourceViewCommonProps, 'items'> & {
        onAction: (newAction: ResourceViewItemActionState) => void;
    };

const ResourceViewGrid: FC<ResourceViewGridProps> = ({
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
        <Stack spacing="xl" p="lg">
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

                        <SimpleGrid cols={3} spacing="lg">
                            {groupedItems.map((item) => (
                                <Anchor
                                    component={Link}
                                    to={getResourceUrl(projectUuid, item)}
                                    key={item.type + '-' + item.data.uuid}
                                    sx={{
                                        display: 'block',
                                        color: 'unset',
                                        ':hover': {
                                            color: 'unset',
                                            textDecoration: 'unset',
                                        },
                                    }}
                                >
                                    {item.type ===
                                    ResourceViewItemType.SPACE ? (
                                        <ResourceViewGridSpaceItem
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
                                      ResourceViewItemType.CHART ? (
                                        <ResourceViewGridChartItem
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
                                    )}
                                </Anchor>
                            ))}
                        </SimpleGrid>
                    </Stack>
                );
            })}
        </Stack>
    );
};

export default ResourceViewGrid;
