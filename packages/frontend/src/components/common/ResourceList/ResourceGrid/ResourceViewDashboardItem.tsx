import { FC } from 'react';
import ResourceIcon from '../ResourceIcon';
import { ResourceListDashboardItem } from '../ResourceTypeUtils';
import {
    // ResourceGridItemFooter,
    ResourceGridItemHeader,
    ResourceGridItemLink,
    ResourceGridItemTitle,
} from './ResourceGridItem.styles';

interface ResourceViewDashboardItemProps {
    item: ResourceListDashboardItem;
    url: string;
    renderActions: () => JSX.Element;
}

const ResourceViewDashboardItem: FC<ResourceViewDashboardItemProps> = ({
    item,
    url,
    renderActions,
}) => {
    return (
        <ResourceGridItemLink minimal outlined href={url}>
            <ResourceGridItemHeader>
                <ResourceIcon item={item} />
                {renderActions()}
            </ResourceGridItemHeader>
            <ResourceGridItemTitle ellipsize>
                {item.data.name}
            </ResourceGridItemTitle>
            {/* TODO: add footer for dashboards */}
            {/* <ResourceGridItemFooter></ResourceGridItemFooter> */}
        </ResourceGridItemLink>
    );
};

export default ResourceViewDashboardItem;
