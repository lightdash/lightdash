import { type CatalogMetricsTreeNode } from '@lightdash/common';
import { createContext, useContext } from 'react';

export type YamlDriverInfo = CatalogMetricsTreeNode;

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
