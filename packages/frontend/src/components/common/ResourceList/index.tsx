import { IconName, NonIdealState } from '@blueprintjs/core';
import { DashboardBasicDetails, SpaceQuery } from '@lightdash/common';
import React from 'react';
import {
    EmptyStateIcon,
    EmptyStateText,
    EmptyStateWrapper,
    ResourceListHeader,
    ResourceListWrapper,
    ResourceTag,
    Spacer,
    Title,
} from './ResourceList.styles';
import ResourceTable from './ResourceTable';

// TODO: create a subset of this type that only includes the fields we need
export type AcceptedResources = SpaceQuery | DashboardBasicDetails;
export type AcceptedResourceTypes = 'saved_chart' | 'dashboard';

export type ResourceListProps<T extends AcceptedResources = AcceptedResources> =
    {
        headerTitle: string;
        headerAction?: React.ReactNode;
        resourceList: T[];
        resourceType: AcceptedResourceTypes;
        resourceIcon: IconName;
        getURL: (data: T) => string;
    };

const getResourceLabel = (resourceType: AcceptedResourceTypes) => {
    switch (resourceType) {
        case 'dashboard':
            return 'dashboard';
        case 'saved_chart':
            return 'chart';
        default:
            throw new Error(`Unknown resource type: ${resourceType}`);
    }
};

const ResourceList: React.FC<ResourceListProps> = ({
    headerTitle,
    headerAction,
    resourceIcon,
    resourceList,
    resourceType,
    getURL,
}) => {
    return (
        <ResourceListWrapper>
            <ResourceListHeader>
                <Title>{headerTitle}</Title>

                <ResourceTag round>{resourceList.length}</ResourceTag>

                <Spacer />

                {headerAction}
            </ResourceListHeader>

            {resourceList.length === 0 ? (
                <EmptyStateWrapper>
                    <NonIdealState
                        description={
                            <EmptyStateWrapper>
                                <EmptyStateIcon icon="chart" size={40} />
                                <EmptyStateText>
                                    No {getResourceLabel(resourceType)}s added
                                    yet
                                </EmptyStateText>
                                <p>
                                    Hit <b>+</b> to get started.
                                </p>
                            </EmptyStateWrapper>
                        }
                    />
                </EmptyStateWrapper>
            ) : (
                <ResourceTable
                    getURL={getURL}
                    resourceType={resourceType}
                    resourceIcon={resourceIcon}
                    resourceList={resourceList}
                />
            )}
        </ResourceListWrapper>
    );
};

export default ResourceList;
