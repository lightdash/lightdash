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

const defaultValue = '{}';

const CustomVisualizationContext = createContext<{
    echartsConfig: string;
    setEchartsConfig: (newConfig: string) => void;
    rows: ResultRow[] | undefined;
}>({
    echartsConfig: defaultValue,
    setEchartsConfig: () => {},
    rows: undefined,
});

export const useCustomVisualizationContext = () =>
    useContext(CustomVisualizationContext);

const convertRowsToSeries = (rows: ResultRow[]) => {
    return rows.map((row) => {
        return Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
                key,
                key === 'payments_unique_payment_count'
                    ? parseInt(value.value.raw as string)
                    : value.value.raw,
            ]),
        );
    });
};

export const CustomVisualizationProvider: FC = ({ children }) => {
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );

    const [echartsConfig, setEchartsConfig] = useState<string>(defaultValue);

    return (
        <CustomVisualizationContext.Provider
            value={{
                echartsConfig,
                setEchartsConfig,
                rows,
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
    const { echartsConfig, rows } = useCustomVisualizationContext();

    const [config, error] = useMemo(() => {
        try {
            return [
                {
                    ...JSON.parse(echartsConfig),
                },
                null,
            ];
        } catch (e) {
            return [null, e];
        }
    }, [echartsConfig]);

    if (error) {
        return <Code>{error.toString()}</Code>;
    }

    const data = { table: convertRowsToSeries(rows || []) };

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
