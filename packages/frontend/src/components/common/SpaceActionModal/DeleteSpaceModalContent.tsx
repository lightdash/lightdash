import { FC } from 'react';
import { SpaceModalBody } from '.';

const DeleteSpaceModalContent: FC<SpaceModalBody> = ({ data }) => (
    <>
        <p>
            Are you sure you want to delete space <b>{data?.name}</b>?
        </p>

        {data && (data.queries.length > 0 || data.dashboards.length > 0) && (
            <p>
                This will delete
                {data.queries.length > 0 && (
                    <>
                        {' '}
                        {data.queries.length} chart
                        {data.queries.length === 1 ? '' : 's'}
                    </>
                )}
                {data.queries.length > 0 && data.dashboards.length > 0 && (
                    <> and</>
                )}
                {data.dashboards.length > 0 && (
                    <>
                        {' '}
                        {data.dashboards.length} dashboard
                        {data.dashboards.length === 1 ? '' : 's'}
                    </>
                )}
            </p>
        )}
    </>
);

export default DeleteSpaceModalContent;
