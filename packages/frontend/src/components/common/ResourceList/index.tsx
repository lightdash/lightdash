import { IconName } from '@blueprintjs/core';
import { DashboardBasicDetails, SpaceQuery } from '@lightdash/common';
import React from 'react';
import {
    ResourceListHeader,
    ResourceListWrapper,
    ResourceTag,
    Spacer,
    Title,
} from './ResourceList.style';
import ResourceTable from './ResourceTable';

// TODO: create a subset of this type that only includes the fields we need
export type AcceptedResources = SpaceQuery | DashboardBasicDetails;

export type ResourceListProps<T extends AcceptedResources = AcceptedResources> =
    {
        headerTitle: string;
        headerAction?: React.ReactNode;
        emptyBody?: React.ReactNode;
        resourceList: T[];
        resourceType: 'dashboard' | 'saved_chart';
        resourceIcon: IconName;
        getURL: (data: T) => string;
    };

const ResourceList: React.FC<ResourceListProps> = ({
    headerTitle,
    headerAction,
    emptyBody,
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
                emptyBody
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
