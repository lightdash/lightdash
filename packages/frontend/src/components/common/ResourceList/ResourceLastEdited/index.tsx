import { FC } from 'react';
import { AcceptedResources } from '..';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import {
    ResourceLastEditedBy,
    ResourceLastEditedTimeAgo,
} from './ResourceLastEdited.styles';

interface ResourceLastEditedProps {
    resource: AcceptedResources;
}

const ResourceLastEdited: FC<ResourceLastEditedProps> = ({
    resource: { updatedAt, updatedByUser: user },
}) => {
    const timeAgo = useTimeAgo(updatedAt);

    return (
        <div>
            <ResourceLastEditedTimeAgo>{timeAgo}</ResourceLastEditedTimeAgo>

            {user && user.firstName ? (
                <ResourceLastEditedBy>
                    by {user.firstName} {user.lastName}
                </ResourceLastEditedBy>
            ) : null}
        </div>
    );
};

export default ResourceLastEdited;
