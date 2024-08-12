import { Box, Center, Flex, Tabs } from '@mantine/core';
import { IconSql, IconTable } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useAppSelector } from '../store/hooks';
import ResultsViewer from './ResultsViewer';
import SqlViewer from './SqlViewer';

const Content: FC = () => {
    const { view, selectedDimensions, selectedMetrics } = useAppSelector(
        (state) => state.semanticViewer,
    );

    if (!view) {
        return null;
    }

    if (selectedDimensions.length === 0 && selectedMetrics.length === 0) {
        return null;
    }

    return (
        <Flex direction="column" w="100%" maw="100%" h="100%" mah="100%">
            <Box sx={{ flexGrow: 0, flexShrink: 0, flexBasis: '60%' }}>
                <Center h="100%">
                    <SuboptimalState title="Chart building will be available soon" />
                </Center>
            </Box>

            <Box
                sx={{
                    flexGrow: 0,
                    flexShrink: 0,
                    flexBasis: '40%',
                    overflow: 'hidden',
                }}
            >
                <Tabs
                    keepMounted={false}
                    styles={{
                        root: {
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            overflow: 'hidden',
                        },
                        panel: {
                            overflow: 'auto',
                            flexGrow: 1,
                        },
                    }}
                    defaultValue="results"
                >
                    <Tabs.List>
                        <Tabs.Tab
                            value="results"
                            icon={<MantineIcon icon={IconTable} />}
                        >
                            Results
                        </Tabs.Tab>

                        <Tabs.Tab
                            value="sql"
                            icon={<MantineIcon icon={IconSql} />}
                        >
                            Generated SQL
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="results">
                        <ResultsViewer />
                    </Tabs.Panel>

                    <Tabs.Panel value="sql">
                        <SqlViewer />
                    </Tabs.Panel>
                </Tabs>
            </Box>
        </Flex>
    );
};

export default Content;
