import { useContext, useMemo, type Context } from 'react';
import {
    ConfigContext,
    LayoutContext,
    ServicesContext,
    StateContext,
    type VisualizationConfigValue,
    type VisualizationContextValue,
    type VisualizationLayout,
    type VisualizationServices,
    type VisualizationState,
} from './context';
import { type VisualizationConfig } from './types';

const useRequiredContext = <T>(context: Context<T | undefined>): T => {
    const value = useContext(context);
    if (value === undefined) {
        throw new Error(
            'useVisualizationContext must be used within a VisualizationProvider',
        );
    }
    return value;
};

/** Refs and actions; never re-renders the caller after mount. */
export const useVisualizationServices = (): VisualizationServices =>
    useRequiredContext(ServicesContext);

/** Container size; re-renders the caller on every resize. */
export const useVisualizationLayout = (): VisualizationLayout =>
    useRequiredContext(LayoutContext);

/** Results, fields, colours and flags; does not re-render on an edit. */
export const useVisualizationInputs = (): VisualizationState =>
    useRequiredContext(StateContext);

/** The editor's config and what derives from it; re-renders on every edit. */
export const useVisualizationConfig = (): VisualizationConfig =>
    useRequiredContext(ConfigContext).visualizationConfig;

/** The chart config as the editor currently has it. */
export const useEditedChartConfig = () =>
    useRequiredContext(ConfigContext).chartConfig;

/** Series colours resolved against the current config. */
export const useSeriesColor = () =>
    useRequiredContext(ConfigContext).getSeriesColor;

/**
 * Inputs and config together; re-renders on every edit. Prefer
 * `useVisualizationInputs` plus a store selector or `useVisualizationConfig`.
 */
export const useVisualizationState = (): VisualizationState &
    VisualizationConfigValue => {
    const state = useVisualizationInputs();
    const config = useRequiredContext(ConfigContext);
    return useMemo(() => ({ ...state, ...config }), [state, config]);
};

/** Everything at once: subscribes to every change, including resizes. */
export function useVisualizationContext(): VisualizationContextValue {
    const services = useVisualizationServices();
    const layout = useVisualizationLayout();
    const state = useVisualizationState();
    return useMemo(
        () => ({ ...services, ...layout, ...state }),
        [services, layout, state],
    );
}
