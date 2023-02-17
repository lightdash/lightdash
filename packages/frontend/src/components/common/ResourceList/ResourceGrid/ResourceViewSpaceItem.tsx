import { Colors, Icon } from '@blueprintjs/core';
import { FC } from 'react';
import {
    ResourceGridItemCount,
    ResourceGridItemFooter,
    ResourceGridItemHeader,
    ResourceGridItemLink,
    ResourceGridItemTitle,
} from './ResourceGridItem.styles';

interface ResourceViewSpaceItemProps {
    name: string;
    url: string;
    dashboardsCount: number;
    queriesCount: number;
    renderActions: () => JSX.Element;
}

const ResourceViewSpaceItem: FC<ResourceViewSpaceItemProps> = ({
    name,
    url,
    dashboardsCount,
    queriesCount,
    renderActions,
}) => {
    return (
        <ResourceGridItemLink minimal outlined href={url}>
            <ResourceGridItemHeader>
                <Icon icon="folder-close" size={20} color={Colors.BLUE5}></Icon>
                {renderActions()}
            </ResourceGridItemHeader>
            <ResourceGridItemTitle ellipsize>{name}</ResourceGridItemTitle>
            <ResourceGridItemFooter>
                <ResourceGridItemCount icon="control" value={dashboardsCount} />
                <ResourceGridItemCount icon="chart" value={queriesCount} />
            </ResourceGridItemFooter>
        </ResourceGridItemLink>
    );
};

export default ResourceViewSpaceItem;
