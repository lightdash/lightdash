import { Stack } from '@mantine/core';

export const FormContainer = ({ children }: { children: React.ReactNode }) => {
    return (
        <Stack spacing={20} w="100%">
            {children}
        </Stack>
    );
};
