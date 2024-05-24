import { type ApiCatalogMetadataResults } from '@lightdash/common';
import { Flex, Stack, Table, Text } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconCornerDownLeft,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import { useHistory } from 'react-router-dom';

type Props = {
    projectUuid: string;
    data: ApiCatalogMetadataResults;
};

export const CatalogMetadata: FC<React.PropsWithChildren<Props>> = ({
    projectUuid,
    data,
}) => {
    const history = useHistory();
    return (
        <Stack style={{ position: 'relative', minHeight: '100vh' }}>
            <Text
                underline={true}
                size="l"
                weight={700}
                onDoubleClick={() => {
                    history.push(
                        `/projects/${projectUuid}/tables/${data.modelName}`,
                    );
                }}
            >
                {data.name}
            </Text>
            <MarkdownPreview
                style={{ fontSize: 'small' }}
                source={data.description}
            />

            <Text> Overview</Text>
            {/* TODO make this a tab*/}

            <Text>Tags</Text>
            <Flex justify="space-between">
                <Text>Model name </Text>
                <Text
                    underline={true}
                    weight={700}
                    onDoubleClick={() => {
                        history.push(
                            `/projects/${projectUuid}/tables/${data.modelName}`,
                        );
                    }}
                >
                    {data.modelName}
                </Text>
            </Flex>
            <Flex justify="space-between">
                <Text>Source </Text>
                <Text>{data.source}</Text>
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

            <Stack
                p={10}
                style={{
                    backgroundColor: 'lightgray',
                    position: 'absolute',
                    bottom: 0,
                    width: '100%',
                    color: 'gray',
                }}
            >
                <Flex>
                    <IconArrowUp />
                    <IconArrowDown />
                    <Text>Navigate</Text>

                    <IconCornerDownLeft />
                    <Text>Use</Text>
                </Flex>
            </Stack>
        </Stack>
    );
};
