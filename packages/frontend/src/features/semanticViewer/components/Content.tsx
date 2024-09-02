import { Box, Flex, Group, Paper, SegmentedControl, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChartHistogram, IconCodeCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectAllSelectedFieldNames, selectFilters } from '../store/selectors';
import { EditorTabs, setActiveEditorTab } from '../store/semanticViewerSlice';
import Filters from './Filters';
import ResultsViewer from './ResultsViewer';
import { RunSemanticQueryButton } from './RunSemanticQueryButton';
import SqlViewer from './SqlViewer';

const Content: FC = () => {
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const selectedFilters = useAppSelector(selectFilters);

    const { ref: inputSectionRef, width: inputSectionWidth } = useElementSize();
    const { activeEditorTab, results } = useAppSelector(
        (state) => state.semanticViewer,
    );
    const dispatch = useAppDispatch();

    if (allSelectedFieldNames.length === 0 && selectedFilters.length === 0)
        return null;

    return (
        <Flex direction="column" w="100%" maw="100%" h="100%" mah="100%">
            <Paper
                shadow="none"
                radius={0}
                px="md"
                py={6}
                bg="gray.1"
                sx={(theme) => ({
                    borderWidth: '0 0 0 1px',
                    borderStyle: 'solid',
                    borderColor: theme.colors.gray[3],
                })}
            >
                <Group position="apart">
                    <Group position="apart" pos="relative">
                        <SegmentedControl
                            color="dark"
                            size="sm"
                            radius="sm"
                            data={[
                                {
                                    value: 'chart',
                                    label: (
                                        <Group spacing="xs" noWrap>
                                            <MantineIcon
                                                icon={IconChartHistogram}
                                            />
                                            <Text>Chart</Text>
                                        </Group>
                                    ),
                                    disabled: results.length === 0,
                                },
                                {
                                    value: 'sql',
                                    label: (
                                        <Group spacing="xs" noWrap>
                                            <MantineIcon
                                                icon={IconCodeCircle}
                                            />
                                            <Text>Query</Text>
                                        </Group>
                                    ),
                                    disabled:
                                        allSelectedFieldNames.length === 0,
                                },
                            ]}
                            defaultValue={EditorTabs.VISUALIZATION}
                            onChange={(value) => {
                                if (value === 'sql') {
                                    dispatch(
                                        setActiveEditorTab(EditorTabs.SQL),
                                    );
                                } else {
                                    dispatch(
                                        setActiveEditorTab(
                                            EditorTabs.VISUALIZATION,
                                        ),
                                    );
                                }
                            }}
                        />
                        <Filters />
                    </Group>

                    <Group spacing="md">
                        <RunSemanticQueryButton />
                    </Group>
                </Group>
            </Paper>

            <Paper
                ref={inputSectionRef}
                shadow="none"
                radius={0}
                style={{ flex: 1 }}
                sx={(theme) => ({
                    borderWidth: '0 0 0 1px',
                    borderStyle: 'solid',
                    borderColor: theme.colors.gray[3],
                    overflow: 'auto',
                })}
            >
                {allSelectedFieldNames.length ? (
                    <Box
                        style={{ flex: 1 }}
                        sx={{
                            width: inputSectionWidth,
                        }}
                    >
                        <ConditionalVisibility
                            isVisible={activeEditorTab === EditorTabs.SQL}
                        >
                            <SqlViewer />
                        </ConditionalVisibility>

                        <ConditionalVisibility
                            isVisible={
                                activeEditorTab === EditorTabs.VISUALIZATION
                            }
                        >
                            <ResultsViewer />
                        </ConditionalVisibility>
                    </Box>
                ) : null}
            </Paper>
        </Flex>
    );
};

export default Content;
