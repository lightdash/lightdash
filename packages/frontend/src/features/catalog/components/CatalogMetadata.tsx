import { Flex, Group, ScrollArea, Stack, Table, Text } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconCornerDownLeft,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCatalogContext } from '../providers';

export const CatalogMetadata: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const projectUuid = params.projectUuid;
    const { metadata } = useCatalogContext();
    const history = useHistory();

    if (!metadata) return null;

    return (
        <Stack h="100vh">
            <Text
                underline={true}
                size="l"
                weight={700}
                onDoubleClick={() => {
                    history.push(
                        `/projects/${projectUuid}/tables/${metadata.modelName}`,
                    );
                }}
            >
                {metadata.name}
            </Text>
            <ScrollArea
                variant="primary"
                className="only-vertical"
                offsetScrollbars
                scrollbarSize={8}
            >
                <MarkdownPreview
                    style={{ fontSize: 'small' }}
                    source={metadata.description}
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
                                `/projects/${projectUuid}/tables/${metadata.modelName}`,
                            );
                        }}
                    >
                        {metadata.modelName}
                    </Text>
                </Flex>
                <Flex justify="space-between">
                    <Text>Source </Text>
                    <Text>{metadata.source}</Text>
                </Flex>

                <Table>
                    <thead>
                        <th>
                            <td>field name</td>
                            <td>type</td>
                        </th>
                    </thead>
                    <tbody>
                        {metadata.fields?.map((field) => (
                            <tr key="">
                                <td>{field.name}</td>
                                <td>{field.basicType}</td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </ScrollArea>
            <Stack
                p={10}
                sx={(theme) => ({
                    backgroundColor: theme.colors.gray[0],
                    border: `1px solid ${theme.colors.gray[4]}`,
                    borderLeft: 0,
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    color: 'gray',
                })}
            >
                <Group>
                    <MantineIcon icon={IconArrowUp} />
                    <MantineIcon icon={IconArrowDown} />
                    <Text>Navigate</Text>

                    <MantineIcon icon={IconCornerDownLeft} />
                    <Text>Use</Text>
                </Group>
            </Stack>
        </Stack>
    );
};
