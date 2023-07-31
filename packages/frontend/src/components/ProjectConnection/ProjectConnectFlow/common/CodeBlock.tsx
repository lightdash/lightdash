import { Box } from '@mantine/core';
import { FC } from 'react';

const CodeBlock: FC = ({ children }) => {
    return (
        <Box
            m={0}
            py="sm"
            px="md"
            component="pre"
            ff="monospace"
            bg="gray.0"
            c="gray.8"
            ta="left"
            sx={(theme) => ({
                overflowX: 'auto',
                borderRadius: theme.radius.sm,
            })}
        >
            {children}
        </Box>
    );
};

export default CodeBlock;
