import { Stack } from '@mantine-8/core';

export const FormContainer = ({ children }: { children: React.ReactNode }) => {
    return (
        <Stack gap={20} w="100%">
            {children}
        </Stack>
    );
};
