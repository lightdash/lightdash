import { Colors, Icon } from '@blueprintjs/core';
import { FC } from 'react';
import { ResourceListSpaceItem } from '../ResourceTypeUtils';
import {
    ResourceGridItemCount,
    ResourceGridItemFooter,
    ResourceGridItemHeader,
    ResourceGridItemLink,
    ResourceGridItemTitle,
} from './ResourceGridItem.styles';

interface ResourceViewSpaceItemProps {
    item: ResourceListSpaceItem;
    url: string;
    renderActions: () => JSX.Element;
}

const ResourceViewSpaceItem: FC<ResourceViewSpaceItemProps> = ({
    item,
    url,
    renderActions,
}) => {
    return (
        <ResourceGridItemLink minimal outlined href={url}>
            <ResourceGridItemHeader>
                <Icon icon="folder-close" size={20} color={Colors.BLUE5}></Icon>
                {renderActions()}
            </ResourceGridItemHeader>
            <ResourceGridItemTitle ellipsize>
                {item.data.name}
            </ResourceGridItemTitle>
            <ResourceGridItemFooter>
                <ResourceGridItemCount
                    icon="control"
                    value={item.data.dashboards.length}
                />
                <ResourceGridItemCount
                    icon="chart"
                    value={item.data.queries.length}
                />
            </ResourceGridItemFooter>
        </ResourceGridItemLink>
    );
};

export default ResourceViewSpaceItem;
