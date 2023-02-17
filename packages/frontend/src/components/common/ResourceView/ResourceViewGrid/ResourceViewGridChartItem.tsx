import { FC } from 'react';
import ResourceIcon from '../ResourceIcon';
import { ResourceViewChartItem } from '../ResourceTypeUtils';
import {
    // ResourceViewGridItemFooter,
    ResourceViewGridItemHeader,
    ResourceViewGridItemLink,
    ResourceViewGridItemTitle,
} from './ResourceViewGridItem.styles';

interface ResourceViewGridChartItemProps {
    item: ResourceViewChartItem;
    url: string;
    renderActions: () => JSX.Element;
}

const ResourceViewGridChartItem: FC<ResourceViewGridChartItemProps> = ({
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
            {/* TODO: add footer for charts */}
            {/* <ResourceViewGridItemFooter></ResourceViewGridItemFooter> */}
        </ResourceViewGridItemLink>
    );
};

export default ResourceViewGridChartItem;
