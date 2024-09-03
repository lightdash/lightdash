import { Center, Group, SegmentedControl, Text } from '@mantine/core';
import { IconChartHistogram, IconTable } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectAllSelectedFieldNames } from '../store/selectors';
import { EditorTabs, setActiveEditorTab } from '../store/semanticViewerSlice';
import ContentCharts from './ContentCharts';
import ContentResults from './ContentResults';
import { RunSemanticQueryButton } from './RunSemanticQueryButton';

const Content: FC = () => {
    const dispatch = useAppDispatch();

    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const { results, view, activeEditorTab } = useAppSelector(
        (state) => state.semanticViewer,
    );

    return (
        <>
            <Group
                px="md"
                py="sm"
                bg="gray.1"
                sx={(theme) => ({
                    borderBottom: `1px solid ${theme.colors.gray[3]}`,
                })}
                position="apart"
            >
                <SegmentedControl
                    color="dark"
                    size="sm"
                    radius="sm"
                    data={[
                        {
                            value: EditorTabs.RESULTS,
                            label: (
                                <Group spacing="xs" noWrap>
                                    <MantineIcon icon={IconTable} />
                                    <Text>Results</Text>
                                </Group>
                            ),
                        },
                        {
                            value: EditorTabs.VISUALIZATION,
                            label: (
                                <Group spacing="xs" noWrap>
                                    <MantineIcon icon={IconChartHistogram} />
                                    <Text>Chart</Text>
                                </Group>
                            ),
                        },
                    ]}
                    disabled={
                        allSelectedFieldNames.length === 0 ||
                        results.length === 0
                    }
                    value={activeEditorTab}
                    onChange={(value: EditorTabs) => {
                        dispatch(setActiveEditorTab(value));
                    }}
                />

                <RunSemanticQueryButton />
            </Group>

            {!view ? (
                <Center sx={{ flexGrow: 1 }}>
                    <SuboptimalState
                        title="Select a view"
                        description="Please select a view from the sidebar to start building a query"
                    />
                </Center>
            ) : results.length === 0 ? (
                <Center sx={{ flexGrow: 1 }}>
                    <SuboptimalState
                        title="No results"
                        description="Please run the query to see results"
                    />
                </Center>
            ) : activeEditorTab === EditorTabs.RESULTS ? (
                <ContentResults />
            ) : activeEditorTab === EditorTabs.VISUALIZATION ? (
                <ContentCharts />
            ) : null}
        </>
    );
};

export default Content;
