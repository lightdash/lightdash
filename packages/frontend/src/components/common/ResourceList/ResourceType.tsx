import { assertUnreachable, ChartKind, SpaceQuery } from '@lightdash/common';
import { FC } from 'react';
import { AcceptedResources } from '.';

interface ResourceTypeProps {
    resource: AcceptedResources;
    resourceType: 'chart' | 'dashboard';
}

const ResourceType: FC<ResourceTypeProps> = ({ resource, resourceType }) => {
    switch (resourceType) {
        case 'dashboard':
            return <>Dashboard</>;
        case 'chart':
            switch ((resource as SpaceQuery).chartType) {
                case ChartKind.LINE:
                    return <>Line chart</>;
                case ChartKind.BAR:
                    return <>Bar chart</>;
                case ChartKind.SCATTER:
                    return <>Scatter chart</>;
                case ChartKind.AREA:
                    return <>Area chart</>;
                case ChartKind.MIXED:
                    return <>Mixed chart</>;
                case ChartKind.TABLE:
                    return <>Table</>;
                case ChartKind.BIG_NUMBER:
                    return <>Big number</>;
                default:
                    return null;
            }
        default:
            return assertUnreachable(
                resourceType,
                'Resource type not supported',
            );
    }
};

export default ResourceType;
