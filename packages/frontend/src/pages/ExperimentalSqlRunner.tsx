import { Box, Button, Group, ScrollArea, Stack, Title } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconPlayerPlay, IconSql } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { useQueryResults } from '../hooks/useQueryResults';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';
import VizConfig from './Experimental/components/VizConfig';
import VizLib from './Experimental/components/VizLib';
import { ExplorerDto } from './Experimental/Dto/QuerySourceDto/ExplorerSourceDto';
import { type QuerySourceDto } from './Experimental/Dto/QuerySourceDto/QuerySourceDto';
import { SqlRunnerDto } from './Experimental/Dto/QuerySourceDto/SqlRunnerDto';
import { VizConfigDto } from './Experimental/Dto/VizConfigDto/VizConfigDto';
import { type VizConfiguration } from './Experimental/types';

const ExperimentalSqlRunner = () => {
    const { isLoading: isLoadingSqlMutation, mutateAsync: sqlQueryMutate } =
        useSqlQueryMutation();
    const { isLoading: isLoadingExploreMutation, mutateAsync: exploreMutate } =
        useQueryResults();
    const [vizConf, setVizConf] = useState<VizConfiguration>();
    const [sourceDto, setSourceDto] = useState<QuerySourceDto>();

    const handleSqlRunnerSubmit = useCallback(async () => {
        const data = await sqlQueryMutate(
            'SELECT\n' +
                '  "orders".status AS "orders_status",\n' +
                '  DATE_TRUNC(\'WEEK\', "orders".order_date) AS "orders_order_date_week",\n' +
                '  AVG("orders".amount) AS "orders_average_order_size"\n' +
                'FROM "postgres"."jaffle"."orders" AS "orders"\n' +
                '\n' +
                '\n' +
                'GROUP BY 1,2\n' +
                'ORDER BY "orders_status"\n' +
                'LIMIT 25',
        );
        setSourceDto(new SqlRunnerDto({ data }));
    }, [sqlQueryMutate]);

    const handleExplorerSubmit = useCallback(async () => {
        const data = await exploreMutate('orders', {
            limit: 25,
            sorts: [],
            filters: {},
            exploreName: 'orders',
            dimensions: ['orders_status', 'orders_order_date_week'],
            metrics: ['orders_average_order_size'],
            tableCalculations: [],
            customDimensions: [],
        });
        setSourceDto(new ExplorerDto({ data }));
    }, [exploreMutate]);

    const vizDto = useMemo(() => {
        if (sourceDto) {
            return new VizConfigDto({
                vizConfig: vizConf,
                sourceDto: sourceDto,
            });
        }
    }, [sourceDto, vizConf]);

    const vizLibDto = useMemo(() => {
        if (vizDto) {
            return vizDto.getVizLib();
        }
    }, [vizDto]);

    return (
        <Page title="SQL Runner" withFullHeight withPaddedContent>
            <Stack spacing={'xl'}>
                <Stack>
                    <Title order={2}>Query</Title>
                    <Group>
                        <Button
                            size="xs"
                            leftIcon={<MantineIcon icon={IconSql} />}
                            onClick={handleSqlRunnerSubmit}
                            loading={isLoadingSqlMutation}
                        >
                            Run SQL runner query
                        </Button>
                        <Button
                            size="xs"
                            leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                            onClick={handleExplorerSubmit}
                            loading={isLoadingExploreMutation}
                        >
                            Run Explorer query
                        </Button>
                    </Group>

                    {sourceDto && (
                        <ScrollArea.Autosize
                            mah={200}
                            w={'100%'}
                            mx="auto"
                            placeholder={'json'}
                        >
                            <Prism
                                colorScheme="light"
                                withLineNumbers
                                language="json"
                            >
                                {JSON.stringify(sourceDto.getData(), null, 2)}
                            </Prism>
                        </ScrollArea.Autosize>
                    )}
                </Stack>
                <Stack>
                    <Title order={2}>Viz configuration</Title>
                    {vizDto && (
                        <>
                            <VizConfig
                                value={vizConf}
                                onChange={setVizConf}
                                libOptions={vizDto.getVizLibOptions()}
                                vizOptions={vizDto.getVizOptions()}
                                xAxisOptions={vizDto.getXAxisOptions()}
                                yAxisOptions={vizDto.getYAxisOptions()}
                                pivotOptions={vizDto.getPivotOptions()}
                            />
                            {vizConf && (
                                <ScrollArea.Autosize
                                    mah={200}
                                    w={'100%'}
                                    mx="auto"
                                    placeholder={'json'}
                                >
                                    <Prism
                                        colorScheme="light"
                                        withLineNumbers
                                        language="json"
                                    >
                                        {JSON.stringify(vizConf, null, 2)}
                                    </Prism>
                                </ScrollArea.Autosize>
                            )}
                        </>
                    )}
                </Stack>
                <Stack>
                    <Title order={2}>Viz library</Title>
                    <Box sx={{ flex: 1, height: '100%' }}>
                        {vizLibDto && <VizLib vizLibDto={vizLibDto} />}
                    </Box>
                    {vizLibDto && (
                        <ScrollArea.Autosize
                            mah={200}
                            w={'100%'}
                            mx="auto"
                            placeholder={'json'}
                        >
                            <Prism
                                colorScheme="light"
                                withLineNumbers
                                language="json"
                            >
                                {JSON.stringify(vizLibDto.getConfig(), null, 2)}
                            </Prism>
                        </ScrollArea.Autosize>
                    )}
                </Stack>
            </Stack>
        </Page>
    );
};

export default ExperimentalSqlRunner;
