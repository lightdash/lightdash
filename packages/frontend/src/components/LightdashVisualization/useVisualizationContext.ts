import {
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef,
    type Context,
} from 'react';
import {
    useVisualizationSelector,
    type VisualizationStoreState,
} from '../../features/visualization/store';
import {
    ConfigContext,
    LayoutContext,
    ServicesContext,
    StateContext,
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

/** The latest inputs for actions that read them at call time, so the actions stay stable. */
export const useVisualizationInputsRef = () => {
    const inputs = useVisualizationInputs();
    const ref = useRef(inputs);
    useLayoutEffect(() => {
        ref.current = inputs;
    });
    return ref;
};

/** Selects from the store with the inputs as the selector's second argument. */
export const useVisualizationInputSelector = <T>(
    selector: (state: VisualizationStoreState, inputs: VisualizationState) => T,
): T => {
    const inputs = useVisualizationInputs();
    return useVisualizationSelector(
        useCallback(
            (state: VisualizationStoreState) => selector(state, inputs),
            [selector, inputs],
        ),
    );
};

/** The editor's config and what derives from it; re-renders on every edit. */
export const useVisualizationConfig = (): VisualizationConfig =>
    useRequiredContext(ConfigContext).visualizationConfig;

/** The chart config as the editor currently has it. */
export const useEditedChartConfig = () =>
    useRequiredContext(ConfigContext).chartConfig;

/** Series colours resolved against the current config. */
export const useSeriesColor = () =>
    useRequiredContext(ConfigContext).getSeriesColor;

/** Everything at once: subscribes to every change, including resizes. */
export function useVisualizationContext(): VisualizationContextValue {
    const services = useVisualizationServices();
    const layout = useVisualizationLayout();
    const inputs = useVisualizationInputs();
    const config = useRequiredContext(ConfigContext);
    return useMemo(
        () => ({ ...services, ...layout, ...inputs, ...config }),
        [services, layout, inputs, config],
    );
}
