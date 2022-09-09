import { Tag } from '@blueprintjs/core';
import { UpdatedByUser } from '@lightdash/common';
import React from 'react';
import {
    ResourceListHeader,
    ResourceListWrapper,
    Spacer,
    Title,
} from './ResourceList.style';

interface DefaultResource {
    uuid: string;
    name: string;
    updatedAt: Date;
    updatedByUser?: UpdatedByUser;
}

type ResourceListProps<T extends DefaultResource> = {
    headerTitle: string;
    headerAction?: React.ReactNode;
    emptyBody?: React.ReactNode;
    resourceList: T[];
    getURL: (data: T) => string;
};

const ResourceList = <T extends DefaultResource>({
    headerTitle,
    headerAction,
    emptyBody,
    resourceList,
    getURL,
}: ResourceListProps<T>) => {
    return (
        <ResourceListWrapper>
            <ResourceListHeader>
                <Title>{headerTitle}</Title>

                <Tag large minimal round>
                    {resourceList.length}
                </Tag>

                <Spacer />

                {headerAction}
            </ResourceListHeader>

            {resourceList.length === 0 ? (
                emptyBody
            ) : (
                <div>
                    {resourceList.map((resource) => (
                        <div key={resource.uuid}>
                            {resource.name}

                            {getURL(resource)}
                        </div>
                    ))}
                </div>
            )}
        </ResourceListWrapper>
    );
};

ResourceList.defaultProps = {
    headerAction: null,
    isChart: false,
    isHomePage: false,
};

export default ResourceList;
