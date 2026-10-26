import { type CustomVis } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useVisualizationInputSelector } from '../components/LightdashVisualization/useVisualizationContext';
import {
    customEditorActions,
    selectCustomEditor,
    selectCustomValidConfig,
    selectCustomVisualizationData,
    useVisualizationDispatch,
    useVisualizationSelector,
} from '../features/visualization/store';

export interface CustomVisualizationConfigAndData {
    validConfig: CustomVis;
    visSpec?: string;
    setVisSpec: (spec: string) => void;
    series: {
        [k: string]: unknown;
    }[];
    fields?: string[];
}

/** Stable setter for the spec text; the last text that parses becomes the spec */
export const useSetCustomVisSpec = () => {
    const dispatch = useVisualizationDispatch();
    return useCallback(
        (spec: string) => dispatch(customEditorActions.specChanged(spec)),
        [dispatch],
    );
};

/** Everything the custom chart body reads, re-rendering on every edit */
const useCustomVisualizationConfig = (): CustomVisualizationConfigAndData => {
    const visSpec = useVisualizationSelector(
        (state) => selectCustomEditor(state).visSpec,
    );
    const validConfig = useVisualizationSelector(selectCustomValidConfig);
    const { series, fields } = useVisualizationInputSelector(
        selectCustomVisualizationData,
    );
    const setVisSpec = useSetCustomVisSpec();

    return useMemo(
        () => ({ validConfig, visSpec, setVisSpec, series, fields }),
        [validConfig, visSpec, setVisSpec, series, fields],
    );
};

export default useCustomVisualizationConfig;
