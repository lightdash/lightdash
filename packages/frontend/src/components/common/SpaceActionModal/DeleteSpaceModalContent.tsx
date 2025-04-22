import { Alert, Text } from '@mantine/core';
import { type FC } from 'react';
import { type SpaceModalBody } from '.';

const DeleteSpaceModalContent: FC<SpaceModalBody> = ({ data }) => {
    if (
        !data ||
        !(
            data.queries.length > 0 ||
            data.dashboards.length > 0 ||
            data.childSpaces.length > 0
        )
    ) {
        return (
            <p>
                Are you sure you want to delete space <b>"{data?.name}"</b>?
            </p>
        );
    }

    return (
        <>
            <p>
                Are you sure you want to delete space <b>"{data?.name}"</b>?
            </p>

            <Alert color="red">
                <Text size="sm" color="gray.9">
                    <strong>This will permanently delete:</strong>
                </Text>
                <ul style={{ paddingLeft: '1rem' }}>
                    {data.queries.length > 0 ? (
                        <li>
                            {data.queries.length} chart
                            {data.queries.length === 1 ? '' : 's'}
                        </li>
                    ) : null}
                    {data.dashboards.length > 0 && (
                        <li>
                            {data.dashboards.length} dashboard
                            {data.dashboards.length === 1 ? '' : 's'}
                        </li>
                    )}
                    {data.childSpaces.length > 0 && (
                        <li>
                            {data.childSpaces.length} nested space
                            {data.childSpaces.length === 1 ? '' : 's'} (and all
                            their contents)
                        </li>
                    )}
                </ul>
            </Alert>
        </>
    );
};

export default DeleteSpaceModalContent;
