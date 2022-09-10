import { IconName } from '@blueprintjs/core';
import { UpdatedByUser } from '@lightdash/common';
import React from 'react';
import {
    ResourceListHeader,
    ResourceListWrapper,
    ResourceTag,
    Spacer,
    Title,
} from './ResourceList.style';
import ResourceTable from './ResourceTable';

export type ResourceListProps<T extends DefaultResource> = {
    headerTitle: string;
    headerAction?: React.ReactNode;
    emptyBody?: React.ReactNode;
    resourceList: T[];
    resourceType: 'dashboard' | 'saved_chart';
    resourceIcon: IconName;
    getURL: (data: T) => string;
};

export interface DefaultResource {
    uuid: string;
    name: string;
    description: string;
    updatedAt: Date;
    updatedByUser?: UpdatedByUser;
}

const ResourceList: React.FC<ResourceListProps<DefaultResource>> = ({
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
