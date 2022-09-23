import { Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import moment from 'moment';
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
            <Tooltip2
                lazy
                position={Position.TOP}
                content={moment(updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            >
                <ResourceLastEditedTimeAgo>{timeAgo}</ResourceLastEditedTimeAgo>
            </Tooltip2>

            {user && user.firstName ? (
                <ResourceLastEditedBy>
                    by {user.firstName} {user.lastName}
                </ResourceLastEditedBy>
            ) : null}
        </div>
    );
};

export default ResourceLastEdited;
