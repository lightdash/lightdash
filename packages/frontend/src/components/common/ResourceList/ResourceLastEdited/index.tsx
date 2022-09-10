import { FC } from 'react';
import { AcceptedResources } from '..';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';

interface ResourceLastEditedProps {
    resource: AcceptedResources;
}

const ResourceLastEdited: FC<ResourceLastEditedProps> = ({
    resource: { updatedAt, updatedByUser: user },
}) => {
    const timeAgo = useTimeAgo(updatedAt);

    return (
        <div>
            <div>{timeAgo}</div>

            {user && user.firstName ? (
                <>
                    by{' '}
                    <div>
                        {user.firstName} {user.lastName}
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default ResourceLastEdited;
