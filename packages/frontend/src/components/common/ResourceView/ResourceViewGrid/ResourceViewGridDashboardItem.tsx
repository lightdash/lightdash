import { FC } from 'react';
import ResourceIcon from '../ResourceIcon';
import { ResourceViewDashboardItem } from '../ResourceTypeUtils';
import {
    // ResourceGridItemFooter,
    ResourceViewGridItemHeader,
    ResourceViewGridItemLink,
    ResourceViewGridItemTitle,
} from './ResourceViewGridItem.styles';

interface ResourceViewGridDashboardItemProps {
    item: ResourceViewDashboardItem;
    url: string;
    renderActions: () => JSX.Element;
}

const ResourceViewGridDashboardItem: FC<ResourceViewGridDashboardItemProps> = ({
    item,
    url,
    renderActions,
}) => {
    return (
        <ResourceViewGridItemLink minimal outlined href={url}>
            <ResourceViewGridItemHeader>
                <ResourceIcon item={item} />
                {renderActions()}
            </ResourceViewGridItemHeader>
            <ResourceViewGridItemTitle ellipsize>
                {item.data.name}
            </ResourceViewGridItemTitle>
            {/* TODO: add footer for dashboards */}
            {/* <ResourceViewGridItemFooter></ResourceViewGridItemFooter> */}
        </ResourceViewGridItemLink>
    );
};

export default ResourceViewGridDashboardItem;
