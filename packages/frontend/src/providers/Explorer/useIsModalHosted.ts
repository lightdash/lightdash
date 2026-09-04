import { type AdditionalMetric, type SavedChart } from '@lightdash/common';
import { createContext, useContext } from 'react';

type ModalHostedValue = {
    /** True when Explorer is inside a modal; saving must not navigate away. */
    isModalHosted: boolean;
    /** Hands the saved chart back to the host so it can stage a tile. */
    onChartSaved?: (chart: SavedChart) => void;
    /** Dashboard context for the save dialog, bypassing sessionStorage. */
    dashboard?: { uuid: string; name: string };
    /** Registry metric ids: badged and frozen in the field tree. */
    dashboardMetricIds?: Set<string>;
    /** Syncs a write-through registry edit back into the host's staged state. */
    onRegistryMetricEdited?: (metric: AdditionalMetric) => void;
};

export const ModalHostedContext = createContext<ModalHostedValue>({
    isModalHosted: false,
});

export const useIsModalHosted = (): boolean =>
    useContext(ModalHostedContext).isModalHosted;

export const useModalHostedChartSaved = ():
    | ((chart: SavedChart) => void)
    | undefined => useContext(ModalHostedContext).onChartSaved;

export const useModalHostedDashboard = ():
    | { uuid: string; name: string }
    | undefined => useContext(ModalHostedContext).dashboard;

export const useModalHostedDashboardMetricIds = (): Set<string> | undefined =>
    useContext(ModalHostedContext).dashboardMetricIds;

export const useModalHostedRegistryMetricEdited = ():
    | ((metric: AdditionalMetric) => void)
    | undefined => useContext(ModalHostedContext).onRegistryMetricEdited;
