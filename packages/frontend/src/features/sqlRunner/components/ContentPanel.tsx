import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
    IconAdjustmentsCog,
    IconLayoutNavbarCollapse,
    IconLayoutNavbarExpand,
    IconPlayerPlay,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { ResizableBox } from 'react-resizable';
import MantineIcon from '../../../components/common/MantineIcon';
import { useSqlQueryRun } from '../hooks/useSqlQueryRun';
import { SqlEditor } from './SqlEditor';
import { Table } from './visualizations/Table';

type Props = {
    isChartConfigOpen: boolean;
    openChartConfig: () => void;
    closeChartConfig: () => void;
};

const MIN_RESULTS_HEIGHT = 50;

export const ContentPanel: FC<Props> = ({
    isChartConfigOpen,
    openChartConfig,
    closeChartConfig,
}) => {
    const {
        ref: inputSectionRef,
        width: inputSectionWidth,
        height: inputSectionHeight,
    } = useElementSize();
    const [sql, setSql] = useState<string>('');
    const { ref: wrapperRef, height: wrapperHeight } = useElementSize();
    const [resultsHeight, setResultsHeight] = useState(MIN_RESULTS_HEIGHT);
    const maxResultsHeight = useMemo(() => wrapperHeight - 58, [wrapperHeight]);
    const isResultsHeightMoreThanHalf = useMemo(
        () => resultsHeight > wrapperHeight / 2,
        [resultsHeight, wrapperHeight],
    );

    const {
        mutate: runSqlQuery,
        data: queryResults,
        isLoading,
    } = useSqlQueryRun();

    return (
        <Stack
            spacing="none"
            style={{ flex: 1, overflow: 'hidden' }}
            ref={wrapperRef}
        >
            <Paper shadow="none" radius={0} px="md" py="sm" withBorder>
                <Group position="apart">
                    <Title order={5} c="gray.6">
                        SQL panel
                    </Title>
                    <Group spacing="md">
                        <Tooltip
                            variant="xs"
                            label={
                                !isResultsHeightMoreThanHalf
                                    ? 'Collapse'
                                    : 'Expand'
                            }
                            position="bottom"
                        >
                            <ActionIcon
                                size="xs"
                                onClick={() =>
                                    setResultsHeight(
                                        isResultsHeightMoreThanHalf
                                            ? MIN_RESULTS_HEIGHT
                                            : maxResultsHeight,
                                    )
                                }
                            >
                                <MantineIcon
                                    icon={
                                        !isResultsHeightMoreThanHalf
                                            ? IconLayoutNavbarCollapse
                                            : IconLayoutNavbarExpand
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            variant="xs"
                            label="Run query"
                            position="bottom"
                        >
                            <Button
                                size="xs"
                                leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                                loading={isLoading}
                                onClick={() => {
                                    if (!sql) return;
                                    runSqlQuery({
                                        sql,
                                    });
                                }}
                            >
                                Run query
                            </Button>
                        </Tooltip>
                    </Group>
                </Group>
            </Paper>
            <Paper
                ref={inputSectionRef}
                shadow="none"
                radius={0}
                p="none"
                withBorder
                style={{ flex: 1 }}
            >
                <Box
                    sx={{
                        position: 'absolute',
                        height: inputSectionHeight,
                        width: inputSectionWidth,
                    }}
                >
                    <SqlEditor sql={sql} onSqlChange={setSql} />
                </Box>
            </Paper>
            <ResizableBox
                height={resultsHeight}
                minConstraints={[50, 50]}
                maxConstraints={[Infinity, maxResultsHeight]}
                resizeHandles={['n']}
                axis="y"
                handle={
                    <Divider
                        h={3}
                        bg="gray.3"
                        pos="absolute"
                        top={-2}
                        left={0}
                        right={0}
                        sx={{
                            cursor: 'ns-resize',
                        }}
                    />
                }
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                }}
                onResizeStop={(e, data) => setResultsHeight(data.size.height)}
            >
                <Paper shadow="none" radius={0} px="md" py="sm" withBorder>
                    <Group position="apart">
                        <Group spacing="xs">
                            <Title order={5} c="gray.6">
                                Results/Chart panel
                            </Title>
                            {isLoading && <Loader size="xs" />}
                        </Group>

                        <Group spacing="md">
                            <Tooltip
                                variant="xs"
                                label={
                                    isResultsHeightMoreThanHalf
                                        ? 'Collapse'
                                        : 'Expand'
                                }
                                position="bottom"
                            >
                                <ActionIcon
                                    size="xs"
                                    onClick={() =>
                                        setResultsHeight(
                                            isResultsHeightMoreThanHalf
                                                ? MIN_RESULTS_HEIGHT
                                                : maxResultsHeight,
                                        )
                                    }
                                >
                                    <MantineIcon
                                        icon={
                                            isResultsHeightMoreThanHalf
                                                ? IconLayoutNavbarExpand
                                                : IconLayoutNavbarCollapse
                                        }
                                    />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip
                                variant="xs"
                                label="Run query"
                                position="bottom"
                            >
                                <ActionIcon
                                    size="xs"
                                    onClick={
                                        isChartConfigOpen
                                            ? closeChartConfig
                                            : openChartConfig
                                    }
                                >
                                    <MantineIcon icon={IconAdjustmentsCog} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </Group>
                </Paper>
                {queryResults && !isLoading && (
                    <Paper
                        shadow="none"
                        radius={0}
                        px="md"
                        py="sm"
                        withBorder
                        style={{ flex: 1 }}
                    >
                        <Table data={queryResults} />
                    </Paper>
                )}
            </ResizableBox>
        </Stack>
    );
};
