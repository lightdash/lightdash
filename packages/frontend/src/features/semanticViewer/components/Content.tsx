import {
    Box,
    Center,
    Flex,
    Group,
    Paper,
    SegmentedControl,
    Text,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChartHistogram, IconCodeCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectAllSelectedFieldNames } from '../store/selectors';
import { EditorTabs, setActiveEditorTab } from '../store/semanticViewerSlice';
import ResultsViewer from './ResultsViewer';
import { RunSemanticQueryButton } from './RunSemanticQueryButton';
import SqlViewer from './SqlViewer';

const Content: FC = () => {
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const { ref: inputSectionRef, width: inputSectionWidth } = useElementSize();
    const { results, view, activeEditorTab } = useAppSelector(
        (state) => state.semanticViewer,
    );
    const dispatch = useAppDispatch();

    return !view ? (
        <Center h="100%">
            <SuboptimalState
                title="Select a view"
                description="Please select a view from the sidebar to start building a query"
            />
        </Center>
    ) : (
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
                    <SegmentedControl
                        color="dark"
                        size="sm"
                        radius="sm"
                        data={[
                            {
                                value: EditorTabs.RESULTS,
                                label: (
                                    <Group spacing="xs" noWrap>
                                        <MantineIcon icon={IconCodeCircle} />
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

                    <RunSemanticQueryButton />
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
                <Box
                    style={{ flex: 1 }}
                    sx={{
                        //position: 'absolute',
                        //overflowY: 'hidden',
                        //height: inputSectionHeight,

                        width: inputSectionWidth,
                    }}
                >
                    <ConditionalVisibility
                        isVisible={activeEditorTab === EditorTabs.RESULTS}
                    >
                        <SqlViewer />
                    </ConditionalVisibility>

                    <ConditionalVisibility
                        isVisible={activeEditorTab === EditorTabs.VISUALIZATION}
                    >
                        <ResultsViewer />
                    </ConditionalVisibility>
                </Box>
            </Paper>
        </Flex>
    );
};

export default Content;
