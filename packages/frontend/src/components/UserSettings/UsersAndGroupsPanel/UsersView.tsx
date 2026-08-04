import { Stack } from '@mantine/core';
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
