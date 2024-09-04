import { FieldType, SemanticLayerSortByDirection } from '@lightdash/common';
import { Button, Center, Group, SegmentedControl, Text } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconChartHistogram,
    IconTable,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectAllSelectedFieldsByKind,
} from '../store/selectors';
import {
    EditorTabs,
    setActiveEditorTab,
    updateSortBy,
} from '../store/semanticViewerSlice';
import ContentCharts from './ContentCharts';
import ContentResults from './ContentResults';
import Filters from './Filters';
import { RunSemanticQueryButton } from './RunSemanticQueryButton';

const Content: FC = () => {
    const dispatch = useAppDispatch();

    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const { results, view, activeEditorTab, sortBy } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const allSelectedFieldsByKind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );

    const handleAddSortBy = (fieldName: string, kind: FieldType) => {
        dispatch(updateSortBy({ name: fieldName, kind }));
    };

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
                <Group>
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
                                        <MantineIcon
                                            icon={IconChartHistogram}
                                        />
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
                </Group>

                <RunSemanticQueryButton />
            </Group>
            <Group
                px="md"
                pt="sm"
                bg="gray.1"
                sx={(theme) => ({
                    borderBottom: `1px solid ${theme.colors.gray[3]}`,
                })}
                spacing="xxs"
                align="baseline"
            >
                <Text fw={600} h="100%" mr="xs">
                    Sort by:
                </Text>
                {Object.entries(allSelectedFieldsByKind).map(([kind, fields]) =>
                    fields.map((field) => {
                        // TODO: this is annoying
                        const normalKind =
                            kind === 'metrics'
                                ? FieldType.METRIC
                                : FieldType.DIMENSION;

                        const sortDirection = sortBy.find(
                            (s) =>
                                s.name === field.name && s.kind === normalKind,
                        )?.direction;

                        return (
                            <Button
                                key={`${kind}-${field.name}`}
                                variant={sortDirection ? 'filled' : 'outline'}
                                size="sm"
                                mr="xs"
                                mb="xs"
                                color={kind === 'metrics' ? 'orange' : 'blue'}
                                compact
                                onClick={() =>
                                    handleAddSortBy(field.name, normalKind)
                                }
                                rightIcon={
                                    sortDirection && (
                                        <MantineIcon
                                            icon={
                                                sortDirection ===
                                                SemanticLayerSortByDirection.ASC
                                                    ? IconArrowUp
                                                    : IconArrowDown
                                            }
                                        ></MantineIcon>
                                    )
                                }
                            >
                                {field.name}
                            </Button>
                        );
                    }),
                )}
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
