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
    console.log(node);

    return (
        <Box data-testid="anode">
            <Text>{node.name}</Text>
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
    console.log(tree);

    return (
        <Stack
            sx={{ maxHeight: '900px', overflow: 'scroll' }}
            data-testid="tree"
        >
            {tree &&
                Object.keys(tree)
                    .sort((a, b) => a.localeCompare(b))
                    .map((groupLabel) => (
                        // <CatalogGroup label={groupLabel} key={groupLabel}>
                        //     <Table>
                        //         <tbody>
                        //             {tree[groupLabel]
                        //                 .sort((a, b) =>
                        //                     a.name.localeCompare(b.name),
                        //                 )
                        //                 .map((item) => (
                        //                     <CatalogListItem
                        //                         key={`${item.name}-${idx}`}
                        //                         catalogItem={item}
                        //                         searchString={searchString}
                        //                         tableUrl={`/projects/${projectUuid}/tables/${item.name}`}
                        //                     />
                        //                 ))}
                        //         </tbody>
                        //     </Table>
                        // </CatalogGroup>
                        <>
                            <Text key={groupLabel}>{groupLabel}</Text>
                            {renderTreeNode(
                                tree[groupLabel],
                                projectUuid,
                                searchString,
                            )}
                        </>
                    ))}
        </Stack>
    );
};
