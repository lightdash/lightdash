import { Stack, TextInput, UnstyledButton } from '@mantine/core';

export const ColumnsList = () => {
    return (
        <Stack pt="sm">
            <TextInput type="search" placeholder="Search" />
            <UnstyledButton>
                <div>Column1</div>
            </UnstyledButton>
        </Stack>
    );
};
