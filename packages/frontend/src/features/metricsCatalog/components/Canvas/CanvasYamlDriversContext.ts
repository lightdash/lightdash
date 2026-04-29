import { createContext, useContext } from 'react';

export type YamlDriverInfo = {
    catalogSearchUuid: string;
    name: string;
    tableName: string;
};

export type CanvasYamlDriversContextValue = {
    yamlDriversByTarget: Map<string, YamlDriverInfo[]>;
    onCanvasMetricUuids: Set<string>;
    addMetricsToCanvas: (
        drivers: YamlDriverInfo[],
        anchorNodeId?: string,
    ) => void;
};

export const CanvasYamlDriversContext =
    createContext<CanvasYamlDriversContextValue | null>(null);

export const useCanvasYamlDrivers = () => useContext(CanvasYamlDriversContext);
