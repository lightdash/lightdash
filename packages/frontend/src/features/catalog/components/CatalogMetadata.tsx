import { type ApiCatalogMetadataResults } from '@lightdash/common';
import { Flex, Stack, Table, Text } from '@mantine/core';
import { type FC } from 'react';

type Props = {
    data: ApiCatalogMetadataResults;
};

export const CatalogMetadata: FC<React.PropsWithChildren<Props>> = ({
    data,
}) => {
    return (
        <Stack>
            <Text size="l" weight={700}>
                {data.name}
            </Text>
            <Text size="sm" weight={500}>
                {data.description}
            </Text>

            <Text> Overview</Text>
            {/* TODO make this a tab*/}

            <Text>Tags</Text>
            <Flex>
                {' '}
                <Text>Model name</Text> {data.modelName}
            </Flex>
            <Flex>
                <Text>Source {data.source}</Text>
            </Flex>

            <Table>
                <thead>
                    <th>
                        <td>field name</td>
                        <td>type</td>
                    </th>
                </thead>
                <tbody>
                    {data.fields?.map((field) => (
                        <tr key="">
                            <td>{field.name}</td>
                            <td>{field.basicType}</td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </Stack>
    );
};
