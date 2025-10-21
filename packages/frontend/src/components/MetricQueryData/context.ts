import {
    type Explore,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { createContext } from 'react';
import { type DrillDownConfig, type UnderlyingDataConfig } from './types';

export type MetricQueryDataContext = {
    tableName: string;
    explore: Explore | undefined;
    metricQuery?: MetricQuery;
    parameters?: ParametersValuesMap;

    underlyingDataConfig: UnderlyingDataConfig | undefined;
    isUnderlyingDataModalOpen: boolean;
    openUnderlyingDataModal: (config: UnderlyingDataConfig) => void;
    closeUnderlyingDataModal: () => void;

    drillDownConfig: DrillDownConfig | undefined;
    isDrillDownModalOpen: boolean;
    openDrillDownModal: (config: DrillDownConfig) => void;
    closeDrillDownModal: () => void;
    queryUuid?: string;
};

export const Context = createContext<MetricQueryDataContext | undefined>(
    undefined,
);
