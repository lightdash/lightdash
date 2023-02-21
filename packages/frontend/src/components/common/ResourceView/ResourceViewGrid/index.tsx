import { assertUnreachable } from '@lightdash/common';
import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import { ResourceViewCommonProps } from '..';
import { useSpaces } from '../../../../hooks/useSpaces';
import { ResourceViewItemActionState } from '../ResourceActionHandlers';
import ResourceActionMenu from '../ResourceActionMenu';
import { ResourceViewItemType } from '../resourceTypeUtils';
import { getResourceUrl } from '../resourceUtils';
import ResourceViewGridChartItem from './ResourceViewGridChartItem';
import ResourceViewGridDashboardItem from './ResourceViewGridDashboardItem';
import { ResourceViewGridWrapper } from './ResourceViewGridItem.styles';
import ResourceViewGridSpaceItem from './ResourceViewGridSpaceItem';

type ResourceViewListProps = Pick<ResourceViewCommonProps, 'items'> & {
    onAction: (newAction: ResourceViewItemActionState) => void;
};

const ResourceViewList: FC<ResourceViewListProps> = ({ items, onAction }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [] } = useSpaces(projectUuid);

    return (
        <ResourceViewGridWrapper>
            {items.map((item) => (
                <React.Fragment key={item.type + '-' + item.data.uuid}>
                    {item.type === ResourceViewItemType.SPACE ? (
                        <ResourceViewGridSpaceItem
                            url={getResourceUrl(projectUuid, item)}
                            item={item}
                            renderActions={() => (
                                <ResourceActionMenu
                                    item={item}
                                    url={getResourceUrl(projectUuid, item)}
                                    onAction={onAction}
                                    spaces={spaces}
                                />
                            )}
                        />
                    ) : item.type === ResourceViewItemType.DASHBOARD ? (
                        <ResourceViewGridDashboardItem
                            url={getResourceUrl(projectUuid, item)}
                            item={item}
                            renderActions={() => (
                                <ResourceActionMenu
                                    item={item}
                                    url={getResourceUrl(projectUuid, item)}
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
                                    url={getResourceUrl(projectUuid, item)}
                                    onAction={onAction}
                                    spaces={spaces}
                                />
                            )}
                        />
                    ) : (
                        assertUnreachable(item, `Resource type not supported`)
                    )}
                </React.Fragment>
            ))}
        </ResourceViewGridWrapper>
    );
};

export default ResourceViewList;
