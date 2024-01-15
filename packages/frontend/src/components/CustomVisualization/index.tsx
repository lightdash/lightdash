import { ResultRow } from '@lightdash/common';
import { Center, Code, Loader } from '@mantine/core';
import {
    createContext,
    FC,
    lazy,
    Suspense,
    useContext,
    useMemo,
    useState,
} from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';

const VegaLite = lazy(() =>
    import('react-vega').then((module) => ({ default: module.VegaLite })),
);

const defaultValue = JSON.stringify({}, null, 2);

const CustomVisualizationContext = createContext<{
    chartConfig: string;
    setChartConfig: (newConfig: string) => void;
    rows: {
        [k: string]: unknown;
    }[];
    fields: string[];
}>({
    chartConfig: defaultValue,
    setChartConfig: () => {},
    rows: [],
    fields: [],
});

export const useCustomVisualizationContext = () =>
    useContext(CustomVisualizationContext);

const convertRowsToSeries = (rows: ResultRow[]) => {
    return rows.map((row) => {
        return Object.fromEntries(
            Object.entries(row).map(([key, rowValue]) => [
                key,
                rowValue.value.raw,
            ]),
        );
    });
};

export const CustomVisualizationProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );

    const [chartConfig, setChartConfig] = useState<string>(defaultValue);

    const convertedRows = useMemo(() => {
        return rows ? convertRowsToSeries(rows) : [];
    }, [rows]);

    const fields = useMemo(() => {
        return rows && rows.length > 0 ? Object.keys(rows[0]) : [];
    }, [rows]);

    return (
        <CustomVisualizationContext.Provider
            value={{
                chartConfig,
                setChartConfig,
                rows: convertedRows,
                fields,
            }}
        >
            {children}
        </CustomVisualizationContext.Provider>
    );
};

type CustomVisualizationProps = {
    className?: string;
    'data-testid'?: string;
};

const CustomVisualization: FC<CustomVisualizationProps> = (props) => {
    const { chartConfig, rows } = useCustomVisualizationContext();

    const [config, error] = useMemo(() => {
        try {
            return [
                {
                    ...JSON.parse(chartConfig),
                },
                null,
            ];
        } catch (e) {
            return [null, e];
        }
    }, [chartConfig]);

    if (error) {
        return <Code>{error.toString()}</Code>;
    }

    const data = { table: rows };

    return (
        <div
            data-testid={props['data-testid']}
            className={props.className}
            style={{
                minHeight: 'inherit',
                height: '100%',
                width: '100%',
            }}
        >
            <Suspense
                fallback={
                    <Center>
                        <Loader color="gray" />
                    </Center>
                }
            >
                <VegaLite
                    style={{
                        width: 'inherit',
                        height: 'inherit',
                        minHeight: 'inherit',
                    }}
                    config={{
                        autosize: {
                            resize: true,
                            type: 'fit',
                        },
                    }}
                    spec={{
                        ...config,
                        width: 'container',
                        height: 'container',
                        data: { name: 'table' },
                    }}
                    data={data}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
