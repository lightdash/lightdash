import {
    MantineProvider,
    Tree,
    getTreeExpandedState,
    useTree,
    type RenderTreeNodePayload,
} from '@lightdash/mantine-v7';
import '@lightdash/mantine-v7/style.css';
import {
    ActionIcon,
    Box,
    Button,
    Checkbox,
    Container,
    Group,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../components/common/MantineIcon';

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
    {
        label: 'node_modules',
        value: 'node_modules',
        children: [
            {
                label: 'react',
                value: 'node_modules/react',
                children: [
                    {
                        label: 'index.d.ts',
                        value: 'node_modules/react/index.d.ts',
                    },
                    {
                        label: 'package.json',
                        value: 'node_modules/react/package.json',
                    },
                ],
            },
            {
                label: '@mantine',
                value: 'node_modules/@mantine',
                children: [
                    {
                        label: 'core',
                        value: 'node_modules/@mantine/core',
                        children: [
                            {
                                label: 'index.d.ts',
                                value: 'node_modules/@mantine/core/index.d.ts',
                            },
                            {
                                label: 'package.json',
                                value: 'node_modules/@mantine/core/package.json',
                            },
                        ],
                    },
                    {
                        label: 'hooks',
                        value: 'node_modules/@mantine/hooks',
                        children: [
                            {
                                label: 'index.d.ts',
                                value: 'node_modules/@mantine/hooks/index.d.ts',
                            },
                            {
                                label: 'package.json',
                                value: 'node_modules/@mantine/hooks/package.json',
                            },
                        ],
                    },
                    {
                        label: 'form',
                        value: 'node_modules/@mantine/form',
                        children: [
                            {
                                label: 'index.d.ts',
                                value: 'node_modules/@mantine/form/index.d.ts',
                            },
                            {
                                label: 'package.json',
                                value: 'node_modules/@mantine/form/package.json',
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        label: 'package.json',
        value: 'package.json',
    },
    {
        label: 'tsconfig.json',
        value: 'tsconfig.json',
    },
];

const renderTreeNode = ({
    node,
    expanded,
    hasChildren,
    elementProps,
    tree,
}: RenderTreeNodePayload) => {
    const checked = tree.isNodeChecked(node.value);
    const indeterminate = tree.isNodeIndeterminate(node.value);

    return (
        <Group spacing="xs" {...elementProps}>
            <Checkbox
                size="xs"
                checked={checked}
                indeterminate={indeterminate}
                onClick={() =>
                    !checked
                        ? tree.checkNode(node.value)
                        : tree.uncheckNode(node.value)
                }
            />

            <Group
                spacing="xs"
                onClick={() => tree.toggleExpanded(node.value)}
                my="two"
            >
                <Text fw={expanded ? 400 : 600}>{node.label}</Text>

                {hasChildren && (
                    <ActionIcon size="xs" variant="default">
                        <MantineIcon
                            icon={IconChevronDown}
                            size={14}
                            style={{
                                transform: expanded
                                    ? 'rotate(180deg)'
                                    : 'rotate(0deg)',
                            }}
                        />
                    </ActionIcon>
                )}
            </Group>
        </Group>
    );
};

const Playground: FC = () => {
    const tree = useTree({
        initialExpandedState: getTreeExpandedState(data, '*'),
        initialCheckedState: [
            'node_modules',
            'node_modules/@mantine/core/index.d.ts',
            'node_modules/@mantine/form/package.json',
        ],
    });

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
                <MantineProvider>
                    <Stack>
                        <Button.Group>
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => tree.checkAllNodes()}
                            >
                                Check all
                            </Button>
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => tree.uncheckAllNodes()}
                            >
                                Uncheck all
                            </Button>
                        </Button.Group>

                        <Tree
                            tree={tree}
                            data={data}
                            levelOffset={23}
                            expandOnClick={false}
                            renderNode={renderTreeNode}
                        />
                    </Stack>
                </MantineProvider>
            </Box>
        </Container>
    );
};

export default Playground;
