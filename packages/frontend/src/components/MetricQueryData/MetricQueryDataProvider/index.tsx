import {
    Explore,
    ItemsMap,
    MetricQuery,
    PivotReference,
    ResultValue,
} from '@lightdash/common';
import { createContext, FC, useCallback, useState } from 'react';

export type UnderlyingDataConfig = {
    item: ItemsMap[string] | undefined;
    value: ResultValue;
    fieldValues: Record<string, ResultValue>;
    dimensions?: string[];
    pivotReference?: PivotReference;
};

export type DrillDownConfig = {
    item: ItemsMap[string];
    fieldValues: Record<string, ResultValue>;
    pivotReference?: PivotReference;
};

export type MetricQueryDataContext = {
    tableName: string;
    explore: Explore | undefined;
    metricQuery?: MetricQuery;

    underlyingDataConfig: UnderlyingDataConfig | undefined;
    isUnderlyingDataModalOpen: boolean;
    openUnderlyingDataModal: (config: UnderlyingDataConfig) => void;
    closeUnderlyingDataModal: () => void;

    drillDownConfig: DrillDownConfig | undefined;
    isDrillDownModalOpen: boolean;
    openDrillDownModal: (config: DrillDownConfig) => void;
    closeDrillDownModal: () => void;
};

export const Context = createContext<MetricQueryDataContext | undefined>(
    undefined,
);

type Props = {
    tableName: string;
    explore: Explore | undefined;
    metricQuery: MetricQuery | undefined;
};

const MetricQueryDataProvider: FC<Props> = ({
    tableName,
    explore,
    metricQuery,
    children,
}) => {
    const [underlyingDataConfig, setUnderlyingDataConfig] =
        useState<UnderlyingDataConfig>();
    const [drillDownConfig, setDrillDownConfig] = useState<DrillDownConfig>();
    const [isUnderlyingDataModalOpen, setIsUnderlyingDataModalOpen] =
        useState<boolean>(false);
    const [isDrillDownModalOpen, setIsDrillDownModalOpen] =
        useState<boolean>(false);

    const openDrillDownModal = useCallback(
        (config: DrillDownConfig) => {
            setDrillDownConfig(config);
            setIsDrillDownModalOpen(true);
        },
        [setDrillDownConfig],
    );
    const closeDrillDownModal = useCallback(() => {
        setIsDrillDownModalOpen(false);
    }, []);

    const openUnderlyingDataModal = useCallback(
        (config: UnderlyingDataConfig) => {
            setUnderlyingDataConfig(config);
            setIsUnderlyingDataModalOpen(true);
        },
        [setUnderlyingDataConfig],
    );
    const closeUnderlyingDataModal = useCallback(() => {
        setIsUnderlyingDataModalOpen(false);
    }, []);

    return (
        <Context.Provider
            value={{
                tableName,
                metricQuery,
                underlyingDataConfig,
                openUnderlyingDataModal,
                isUnderlyingDataModalOpen,
                closeUnderlyingDataModal,
                isDrillDownModalOpen,
                drillDownConfig,
                openDrillDownModal,
                closeDrillDownModal,
                explore,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export default MetricQueryDataProvider;
