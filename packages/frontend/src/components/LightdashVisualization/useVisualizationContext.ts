import { useContext, useMemo, type Context } from 'react';
import {
    LayoutContext,
    ServicesContext,
    StateContext,
    type VisualizationContextValue,
    type VisualizationLayout,
    type VisualizationServices,
    type VisualizationState,
} from './context';

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

/** Data, config and colours; everything except refs, actions and size. */
export const useVisualizationState = (): VisualizationState =>
    useRequiredContext(StateContext);

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
