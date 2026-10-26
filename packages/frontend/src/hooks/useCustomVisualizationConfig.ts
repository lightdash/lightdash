import { type CustomVis } from '@lightdash/common';
import {
    buildCustomVisualizationData,
    parseCustomVisualizationSpec,
    serializeCustomVisualizationSpec,
} from '@lightdash/visualization/editor';
import { useCallback, useEffect, useMemo } from 'react';
import {
    buildCustomEditorState,
    customEditorActions,
    selectCustomEditor,
    useEditorFieldSetter,
    useEditorState,
    type CustomEditorState,
} from '../features/visualization/store';
import { type InfiniteQueryResults } from './useQueryResults';

export interface CustomVisualizationConfigAndData {
    validConfig: CustomVis;
    visSpec?: string;
    setVisSpec: (spec: string) => void;
    // TODO: do we need to type this better?
    series: {
        [k: string]: unknown;
    }[];
    fields?: string[];
}

const useCustomVisualizationConfig = (
    chartConfig: CustomVis | undefined,
    resultsData: InfiniteQueryResults | undefined,
): CustomVisualizationConfigAndData => {
    const { visSpec, visSpecObject } = useEditorState(
        selectCustomEditor,
        customEditorActions,
        buildCustomEditorState,
    );
    const set = useEditorFieldSetter<CustomEditorState>(
        selectCustomEditor,
        customEditorActions.set,
    );
    const setVisSpec = useCallback(
        (spec: string) => set('visSpec', spec),
        [set],
    );

    // Set initial value
    useEffect(() => {
        if (chartConfig?.spec && !visSpec) {
            const serialized = serializeCustomVisualizationSpec(
                chartConfig?.spec,
            );
            if (serialized !== undefined) set('visSpec', serialized);
        }
    }, [chartConfig?.spec, visSpec, set]);

    // Update object when spec changes
    useEffect(() => {
        if (visSpec) {
            const parsed = parseCustomVisualizationSpec(visSpec);
            if (parsed !== undefined) set('visSpecObject', parsed);
        }
    }, [visSpec, set]);

    const rows = useMemo(() => resultsData?.rows, [resultsData]);

    const { series, fields } = useMemo(
        () => buildCustomVisualizationData(rows ? { rows } : undefined),
        [rows],
    );

    const validConfig = useMemo(
        () => ({ spec: visSpecObject }),
        [visSpecObject],
    );

    return useMemo(
        () => ({
            validConfig,
            visSpec,
            setVisSpec,
            series,
            fields,
        }),
        [validConfig, visSpec, setVisSpec, series, fields],
    );
};

export default useCustomVisualizationConfig;
