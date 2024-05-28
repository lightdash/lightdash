import {
    type ApiCatalogAnalyticsResults,
    type ApiCatalogMetadataResults,
} from '@lightdash/common';
import { Flex, Stack, Table, Tabs, Text } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconCornerDownLeft,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import { useHistory } from 'react-router-dom';
import { CatalogAnalyticCharts } from './CatalogAnalyticCharts';

type Props = {
    projectUuid: string;
    metadataResults: ApiCatalogMetadataResults;
    analyticResults?: ApiCatalogAnalyticsResults;
    isAnalyticsLoading: boolean;
};

export const CatalogMetadata: FC<React.PropsWithChildren<Props>> = ({
    projectUuid,
    metadataResults,
    analyticResults,
    isAnalyticsLoading,
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
                        `/projects/${projectUuid}/tables/${metadataResults.modelName}`,
                    );
                }}
            >
                {metadataResults.name}
            </Text>
            <MarkdownPreview
                style={{ fontSize: 'small' }}
                source={metadataResults.description}
            />
            <Tabs defaultValue="overview">
                <Tabs.List>
                    <Tabs.Tab value={'overview'} mx="md">
                        Overview
                    </Tabs.Tab>
                    <Tabs.Tab value={'analytics'} mx="md">
                        {/* TODO replace loading with spinner ?*/}
                        analytics (
                        {isAnalyticsLoading
                            ? '.'
                            : analyticResults?.charts.length || '0'}
                        )
                    </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="overview">
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
                            <tr>
                                <th>field name</th>
                                <th>type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.fields?.map((field) => (
                                <tr key={field.name}>
                                    <td>{field.name}</td>
                                    <td>{field.basicType}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Tabs.Panel>
                <Tabs.Panel value="analytics" w={300}>
                    <>
                        {analyticResults && (
                            <CatalogAnalyticCharts
                                projectUuid={projectUuid}
                                analyticResults={analyticResults}
                            />
                        )}
                    </>
                </Tabs.Panel>
            </Tabs>
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
