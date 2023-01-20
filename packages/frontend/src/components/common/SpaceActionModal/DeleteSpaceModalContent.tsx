import { FC } from 'react';
import { SpaceModalBody } from '.';
import BlueprintParagraph from '../BlueprintParagraph';

const DeleteSpaceModalContent: FC<SpaceModalBody> = ({ data }) => (
    <>
        <BlueprintParagraph>
            Are you sure you want to delete space <b>{data?.name}</b>?
        </BlueprintParagraph>

        {data && (data.queries.length > 0 || data.dashboards.length > 0) && (
            <BlueprintParagraph>
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
            </BlueprintParagraph>
        )}
    </>
);

export default DeleteSpaceModalContent;
