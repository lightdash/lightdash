import {
    Group,
    ScrollArea,
    Stack,
    Table,
    Tabs,
    Text,
    useMantineTheme,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconCornerDownLeft,
} from '@tabler/icons-react';
import { useIsFetching } from '@tanstack/react-query';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCatalogContext } from '../context/CatalogProvider';
import { CatalogAnalyticCharts } from './CatalogAnalyticCharts';

export const CatalogMetadata: FC = () => {
    const { colors } = useMantineTheme();
    const { projectUuid, metadata, analyticsResults, selection } =
        useCatalogContext();

    const isFetchingAnalytics = useIsFetching({
        queryKey: ['catalog_analytics', projectUuid],
    });
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

                <Tabs defaultValue="overview">
                    <Tabs.List>
                        <Tabs.Tab value={'overview'} mx="md">
                            Overview
                        </Tabs.Tab>
                        <Tabs.Tab value={'analytics'} mx="md">
                            {/* TODO replace loading with spinner ?*/}
                            analytics (
                            {isFetchingAnalytics
                                ? '.'
                                : analyticsResults?.charts.length || '0'}
                            )
                        </Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="overview">
                        <Text> Overview</Text>
                        {/* TODO make this a tab*/}

                        <Table>
                            <thead>
                                <tr>
                                    <th>field name</th>
                                    <th>type</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metadata.fields?.map((field) => (
                                    <tr
                                        key={field.name}
                                        style={{
                                            border:
                                                selection &&
                                                selection?.field &&
                                                selection.field === field.name
                                                    ? `2px solid ${colors.blue[6]}`
                                                    : undefined,
                                        }}
                                    >
                                        <td>{field.name}</td>
                                        <td>{field.basicType}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </Tabs.Panel>
                    <Tabs.Panel value="analytics" w={300}>
                        <>
                            {analyticsResults && (
                                <CatalogAnalyticCharts
                                    projectUuid={projectUuid}
                                    analyticResults={analyticsResults}
                                />
                            )}
                        </>
                    </Tabs.Panel>
                </Tabs>
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
