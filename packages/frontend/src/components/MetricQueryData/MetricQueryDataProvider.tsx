import {
    type Explore,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useCallback, useState, type FC } from 'react';
import { Context } from './context';
import { type DrillDownConfig, type UnderlyingDataConfig } from './types';

type Props = {
    tableName: string;
    explore: Explore | undefined;
    metricQuery: MetricQuery | undefined;
    queryUuid?: string;
    parameters?: ParametersValuesMap;
};

const MetricQueryDataProvider: FC<React.PropsWithChildren<Props>> = ({
    tableName,
    explore,
    metricQuery,
    queryUuid,
    parameters,
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
                parameters,
                underlyingDataConfig,
                openUnderlyingDataModal,
                isUnderlyingDataModalOpen,
                closeUnderlyingDataModal,
                isDrillDownModalOpen,
                drillDownConfig,
                openDrillDownModal,
                closeDrillDownModal,
                explore,
                queryUuid,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export default MetricQueryDataProvider;
