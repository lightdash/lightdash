import { Stack } from '@mantine-8/core';
import { type FC } from 'react';
import UsersTable from './UsersTable';

const UsersView: FC = () => {
    return (
        <Stack gap="xs">
            <UsersTable />
        </Stack>
    );
};

export default UsersView;
