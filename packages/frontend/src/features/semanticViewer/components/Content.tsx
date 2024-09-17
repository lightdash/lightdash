import { Center, Group, SegmentedControl, Text } from '@mantine/core';
import { IconChartHistogram, IconCodeCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectAllSelectedFieldsByKind,
} from '../store/selectors';
import { EditorTabs, setActiveEditorTab } from '../store/semanticViewerSlice';
import ContentCharts from './ContentCharts';
import ContentResults from './ContentResults';
import Filters from './Filters';
import { RunSemanticQueryButton } from './RunSemanticQueryButton';

const Content: FC = () => {
    const dispatch = useAppDispatch();

    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const { results, view, activeEditorTab } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const allSelectedFieldsByKind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );

    const selectedFieldsCount =
        allSelectedFieldsByKind.dimensions.length +
        allSelectedFieldsByKind.metrics.length +
        allSelectedFieldsByKind.timeDimensions.length;

    return (
        <>
            <Group
                h="4xl"
                pl="sm"
                pr="md"
                bg="gray.1"
                sx={(theme) => ({
                    borderBottom: `1px solid ${theme.colors.gray[3]}`,
                    flexShrink: 0,
                })}
            >
                <SegmentedControl
                    styles={(theme) => ({
                        root: {
                            backgroundColor: theme.colors.gray[2],
                        },
                    })}
                    size="sm"
                    radius="md"
                    data={[
                        {
                            value: EditorTabs.QUERY,
                            label: (
                                <Group spacing="xs" noWrap>
                                    <MantineIcon icon={IconCodeCircle} />
                                    <Text>Query</Text>
                                </Group>
                            ),
                        },
                        {
                            value: EditorTabs.VIZ,
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

                {!!view && <Filters />}

                <RunSemanticQueryButton ml="auto" />
            </Group>
            {!view ? (
                <Center sx={{ flexGrow: 1 }}>
                    <SuboptimalState
                        title="Select a view"
                        description="Please select a view from the sidebar to start building a query"
                    />
                </Center>
            ) : selectedFieldsCount === 0 ? (
                <Center sx={{ flexGrow: 1 }}>
                    <SuboptimalState
                        title="Select a field"
                        description="Please select a field from the sidebar to start building a query"
                    />
                </Center>
            ) : activeEditorTab === EditorTabs.QUERY ? (
                <ContentResults />
            ) : activeEditorTab === EditorTabs.VIZ ? (
                <ContentCharts />
            ) : null}
        </>
    );
};

export default Content;
