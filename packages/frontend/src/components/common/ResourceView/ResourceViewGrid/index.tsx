import { assertUnreachable } from '@lightdash/common';
import { Anchor, SimpleGrid, Stack, Text } from '@mantine/core';
import { FC, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ResourceViewCommonProps } from '..';
import { ResourceViewItemActionState } from '../ResourceActionHandlers';
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

    const groupedItems = useMemo(() => {
        return groups
            .map((group) => ({
                name: group
                    .map((g) => getResourceName(g) + 's')
                    .join(', ')
                    .replace(/, ([^,]*)$/, ' & $1'), // replaces last comma with '&'

                items: items.filter((item) => group.includes(item.type)),
            }))
            .filter((group) => group.items.length > 0);
    }, [groups, items]);

    return (
        <Stack spacing="xl" p="lg">
            {groupedItems.map((group) => (
                <Stack spacing={5} key={group.name}>
                    {groupedItems.length > 1 && (
                        <Text
                            transform="uppercase"
                            fz="xs"
                            fw="bold"
                            color="gray.6"
                        >
                            {group.name}
                        </Text>
                    )}

                    <SimpleGrid cols={3} spacing="lg">
                        {group.items.map((item) => (
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
                                {item.type === ResourceViewItemType.SPACE ? (
                                    <ResourceViewGridSpaceItem
                                        item={item}
                                        onAction={onAction}
                                    />
                                ) : item.type ===
                                  ResourceViewItemType.DASHBOARD ? (
                                    <ResourceViewGridDashboardItem
                                        item={item}
                                        onAction={onAction}
                                    />
                                ) : item.type === ResourceViewItemType.CHART ? (
                                    <ResourceViewGridChartItem
                                        item={item}
                                        onAction={onAction}
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
            ))}
        </Stack>
    );
};

export default ResourceViewGrid;
