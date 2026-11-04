import { Stack } from '@mantine/core';

export const FormContainer = ({ children }: { children: React.ReactNode }) => {
    return (
        <Stack gap="lg" w="100%">
            {children}
        </Stack>
    );
};
