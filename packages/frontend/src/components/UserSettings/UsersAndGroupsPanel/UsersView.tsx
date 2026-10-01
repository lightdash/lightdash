import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { JoinRequestsPanel } from './JoinRequestsPanel';
import UsersTable from './UsersTable';

const UsersView: FC = () => {
    return (
        <Stack gap="xs">
            <JoinRequestsPanel />
            <UsersTable />
        </Stack>
    );
};

export default UsersView;
