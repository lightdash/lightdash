import { Tree } from '@lightdash/mantine-v7';
import '@lightdash/mantine-v7/dist/styles.css';
import { Box, Container, Title } from '@mantine/core';
import { type FC } from 'react';

const data = [
    {
        label: 'src',
        value: 'src',
        children: [
            {
                label: 'components',
                value: 'src/components',
                children: [
                    {
                        label: 'Accordion.tsx',
                        value: 'src/components/Accordion.tsx',
                    },
                    { label: 'Tree.tsx', value: 'src/components/Tree.tsx' },
                    { label: 'Button.tsx', value: 'src/components/Button.tsx' },
                ],
            },
        ],
    },
];

const Playground: FC = () => {
    return (
        <Container size="xl" py="xl">
            <Title order={1} mb="md">
                Component Playground
            </Title>
            <Box
                sx={(theme) => ({
                    backgroundColor: theme.colors.gray[0],
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.lg,
                    minHeight: '70vh',
                    border: `1px solid ${theme.colors.gray[3]}`,
                })}
            >
                <Tree data={data} />
            </Box>
        </Container>
    );
};

export default Playground;
