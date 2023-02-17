import { FC } from 'react';
import ResourceIcon from '../ResourceIcon';
import { ResourceListChartItem } from '../ResourceTypeUtils';
import {
    // ResourceGridItemFooter,
    ResourceGridItemHeader,
    ResourceGridItemLink,
    ResourceGridItemTitle,
} from './ResourceGridItem.styles';

interface ResourceViewChartItemProps {
    item: ResourceListChartItem;
    url: string;
    renderActions: () => JSX.Element;
}

const ResourceViewChartItem: FC<ResourceViewChartItemProps> = ({
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
            {/* TODO: add footer for charts */}
            {/* <ResourceGridItemFooter></ResourceGridItemFooter> */}
        </ResourceGridItemLink>
    );
};

export default ResourceViewChartItem;
