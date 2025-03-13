import { Flex } from '@mantine/core';

export const FormContainer = ({ children }: { children: React.ReactNode }) => {
    return (
        <Flex direction="column" gap={20} w="100%">
            {children}
        </Flex>
    );
};
