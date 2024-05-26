import { Box, Stack, Text } from '@mantine/core';
// import { IconBoxMultiple, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';

type Props = {
    tree: any;
    projectUuid: string;
    searchString?: string;
};

const renderTreeNode = (
    node: any,
    projectUuid: string,
    searchString?: string,
) => {
    console.log({ node });

    return (
        <Box data-testid="anode">
            <Text>{node.name}</Text>
            {node.tables && (
                <Stack>
                    {Object.entries(node.tables).map(([_, value]) =>
                        renderTreeNode(value, projectUuid, searchString),
                    )}
                </Stack>
            )}
            {node.fields && (
                <Stack>
                    {node.fields.map((child: any) =>
                        renderTreeNode(child, projectUuid, searchString),
                    )}
                </Stack>
            )}
        </Box>
    );
};

export const CatalogTree: FC<React.PropsWithChildren<Props>> = ({
    tree,
    searchString,
    projectUuid,
}) => {
    if (!tree) {
        return null;
    }
    console.log({ tree });

    return (
        <Stack
            sx={{ maxHeight: '900px', overflow: 'scroll' }}
            data-testid="tree"
        >
            {Object.entries(tree).map(([_, value]) =>
                renderTreeNode(value, projectUuid, searchString),
            )}
        </Stack>
    );
};
