import { Colors, Icon } from '@blueprintjs/core';
import { FC } from 'react';
import { ResourceViewSpaceItem } from '../resourceTypeUtils';
import {
    ResourceViewGridItemCount,
    ResourceViewGridItemFooter,
    ResourceViewGridItemHeader,
    ResourceViewGridItemLink,
    ResourceViewGridItemTitle,
} from './ResourceViewGridItem.styles';

interface ResourceViewGridSpaceItemProps {
    item: ResourceViewSpaceItem;
    url: string;
    renderActions: () => JSX.Element;
}

const ResourceViewGridSpaceItem: FC<ResourceViewGridSpaceItemProps> = ({
    item,
    url,
    renderActions,
}) => {
    return (
        <ResourceViewGridItemLink minimal outlined href={url}>
            <ResourceViewGridItemHeader>
                <Icon icon="folder-close" size={20} color={Colors.BLUE5}></Icon>
                {renderActions()}
            </ResourceViewGridItemHeader>
            <ResourceViewGridItemTitle ellipsize>
                {item.data.name}
            </ResourceViewGridItemTitle>
            <ResourceViewGridItemFooter>
                <ResourceViewGridItemCount
                    icon="control"
                    value={item.data.dashboards.length}
                />
                <ResourceViewGridItemCount
                    icon="chart"
                    value={item.data.queries.length}
                />
            </ResourceViewGridItemFooter>
        </ResourceViewGridItemLink>
    );
};

export default ResourceViewGridSpaceItem;
