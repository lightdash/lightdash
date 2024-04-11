import {
    CartesianSeriesType,
    getResultValueArray,
    getSeriesId,
    hashFieldReference,
    type ApiQueryResults,
    type ApiSqlQueryResults,
    type ResultRow,
    type Series,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    MultiSelect,
    ScrollArea,
    Select,
    Stack,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { Prism } from '@mantine/prism';
import { IconPlayerPlay, IconSql } from '@tabler/icons-react';
import EChartsReact from 'echarts-for-react';
import { useCallback, useMemo, useState } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { type EChartSeries } from '../hooks/echarts/useEchartsCartesianConfig';
import { useQueryResults } from '../hooks/useQueryResults';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';

type VizConfigArguments = {
    value: VizConfiguration | undefined;
    onChange: (value: VizConfiguration) => void;
    libOptions: string[];
    vizOptions: string[];
    xAxisOptions: string[];
    yAxisOptions: string[];
    pivotOptions: string[];
};
const VizConfig = ({
    value,
    onChange,
    libOptions,
    vizOptions,
    xAxisOptions,
    yAxisOptions,
    pivotOptions,
}: VizConfigArguments) => {
    const form = useForm({
        initialValues: value,
    });
    return (
        <form onSubmit={form.onSubmit(onChange)}>
            <Group>
                <Select
                    label="Your favorite framework/library"
                    placeholder="Pick one"
                    data={libOptions}
                    {...form.getInputProps('libType')}
                />
                <Select
                    label="Your favorite type of chart"
                    placeholder="Pick one"
                    data={vizOptions}
                    {...form.getInputProps('vizType')}
                />
                <Select
                    label="X axis"
                    placeholder="Pick one"
                    data={xAxisOptions}
                    {...form.getInputProps('xField')}
                />
                <MultiSelect
                    label="Y axis"
                    placeholder="Pick one"
                    data={yAxisOptions}
                    {...form.getInputProps('yFields')}
                />
                <MultiSelect
                    label="Pivot fields"
                    placeholder="Pick one"
                    data={pivotOptions}
                    {...form.getInputProps('pivotFields')}
                />
                <Button type="submit" sx={{ alignSelf: 'flex-end' }}>
                    Apply
                </Button>
            </Group>
        </form>
    );
};

const Viz = ({ config }: { config: any }) => {
    return (
        <EChartsReact
            style={{
                minHeight: 'inherit',
                height: '100%',
                width: '100%',
            }}
            option={config}
            notMerge
        />
    );
};

interface SourceDto {
    type: string;

    getData: () => unknown;

    getRows: () => ResultRow[];

    getFieldOptions(): string[];

    getPivotOptions(): string[];
}

type VizConfiguration = {
    libType: string;
    vizType: string;
    xField: string;
    yFields: string[];
    pivotFields: string[];
};

type ExplorerDtoArguments = {
    data: ApiQueryResults;
};

class ExplorerDto implements SourceDto {
    public type = 'explorer' as const;

    private readonly data: ApiQueryResults;

    constructor(args: ExplorerDtoArguments) {
        this.data = args.data;
    }

    public getData() {
        return this.data;
    }

    public getFieldOptions() {
        return [
            ...this.data.metricQuery.dimensions,
            ...this.data.metricQuery.metrics,
        ];
    }

    public getPivotOptions() {
        return this.data.metricQuery.dimensions;
    }

    public getRows() {
        return this.data.rows;
    }
}

type SqlRunnerDtoArguments = {
    data: ApiSqlQueryResults;
};

class SqlRunnerDto implements SourceDto {
    public type = 'sql_runner' as const;

    private readonly data: ApiSqlQueryResults;

    constructor(args: SqlRunnerDtoArguments) {
        this.data = args.data;
    }

    public getData() {
        return this.data;
    }

    public getFieldOptions() {
        return Object.keys(this.data.fields);
    }

    public getPivotOptions() {
        return Object.keys(this.data.fields);
    }

    public getRows(): ResultRow[] {
        return (this.data.rows || []).map((row) =>
            Object.keys(row).reduce<ResultRow>((acc, columnName) => {
                const raw = row[columnName];
                return {
                    ...acc,
                    [columnName]: {
                        value: {
                            raw,
                            formatted: `${raw}`,
                        },
                    },
                };
            }, {}),
        );
    }
}

interface VizLibDto {
    type: 'echarts' | 'table';

    getVizOptions(): string[];

    getConfig(): unknown;

    getXAxisOptions(): string[];

    getYAxisOptions(): string[];

    getPivotOptions(): string[];
}

interface EchartsArguments {
    vizConfig?: VizConfiguration;
    sourceDto: SourceDto;
}

class EchartsDto implements VizLibDto {
    public type = 'echarts' as const;

    private readonly sourceDto: SourceDto;

    private readonly vizConfig?: VizConfiguration;

    constructor(args: EchartsArguments) {
        this.sourceDto = args.sourceDto;
        this.vizConfig = args.vizConfig;
    }

    public getVizOptions() {
        return ['bar', 'line'];
    }

    public getConfig() {
        const config = {
            xAxis: this.getXAxis(),
            yAxis: this.getYAxis(),
            useUTC: true,
            series: this.getSeries(),
            dataset: this.getDataSet(),
        };
        return config;
    }

    public getXAxisOptions() {
        return this.sourceDto.getFieldOptions();
    }

    public getYAxisOptions() {
        return this.sourceDto.getFieldOptions();
    }

    public getPivotOptions() {
        return this.sourceDto.getPivotOptions();
    }

    private getXAxis() {
        return {
            type: 'category',
            name: this.vizConfig?.xField,
            nameLocation: 'center',
            nameTextStyle: {
                fontWeight: 'bold',
            },
        };
    }

    private getYAxis() {
        return {
            type: 'value',
            name: this.vizConfig?.yFields[0],
            nameLocation: 'center',
            nameTextStyle: {
                fontWeight: 'bold',
            },
        };
    }

    private getSeries() {
        const xField = this.vizConfig?.xField;
        const yFields = this.vizConfig?.yFields;
        const vizType = this.vizConfig?.vizType ?? CartesianSeriesType.BAR;

        if (!xField) {
            return [];
        }

        // generate series
        const expectedSeriesMap = (yFields || []).reduce<
            Record<string, Series>
        >((sum, yField) => {
            const series: Series = {
                type: vizType as CartesianSeriesType,
                encode: {
                    xRef: { field: xField },
                    yRef: { field: yField },
                },
            };
            return { ...sum, [getSeriesId(series)]: series };
        }, {});

        // convert to echarts series
        return Object.values(expectedSeriesMap).map<EChartSeries>((series) => {
            const xFieldHash = hashFieldReference(series.encode.xRef);
            const yFieldHash = hashFieldReference(series.encode.yRef);

            return this.getSimpleSeries({
                series,
                yFieldHash,
                xFieldHash,
            });
        });
    }

    private getSimpleSeries({
        series,
        yFieldHash,
        xFieldHash,
    }: {
        series: Series;
        yFieldHash: string;
        xFieldHash: string;
    }) {
        return {
            ...series,
            xAxisIndex: undefined,
            yAxisIndex: series.yAxisIndex,
            emphasis: {
                focus: 'series',
            },
            connectNulls: true,
            encode: {
                ...series.encode,
                x: xFieldHash,
                y: yFieldHash,
                tooltip: [yFieldHash],
                seriesName: yFieldHash,
            },
            labelLayout: {
                hideOverlap: true,
            },
        };
    }

    private getDataSet() {
        return {
            id: 'lightdash-results',
            source: getResultValueArray(this.sourceDto.getRows(), true),
        };
    }
}

const ExperimentalSqlRunner = () => {
    const { isLoading: isLoadingSqlMutation, mutateAsync: sqlQueryMutate } =
        useSqlQueryMutation();
    const { isLoading: isLoadingExploreMutation, mutateAsync: exploreMutate } =
        useQueryResults();
    const [vizConf, setVizConf] = useState<VizConfiguration>();
    const [sourceDto, setSourceDto] = useState<SourceDto>();

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
            return new EchartsDto({
                vizConfig: vizConf,
                sourceDto: sourceDto,
            });
        }
    }, [sourceDto, vizConf]);

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
                                libOptions={['echarts']}
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
                        {vizDto && <Viz config={vizDto.getConfig()} />}
                    </Box>
                    {vizDto && (
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
                                {JSON.stringify(vizDto.getConfig(), null, 2)}
                            </Prism>
                        </ScrollArea.Autosize>
                    )}
                </Stack>
            </Stack>
        </Page>
    );
};

export default ExperimentalSqlRunner;
