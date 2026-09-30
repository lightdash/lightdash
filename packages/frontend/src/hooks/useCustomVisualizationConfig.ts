import { type CustomVis } from '@lightdash/common';
import {
    buildCustomVisualizationData,
    parseCustomVisualizationSpec,
    serializeCustomVisualizationSpec,
} from '@lightdash/visualization/editor';
import { useEffect, useMemo, useState } from 'react';
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
    const [visSpec, setVisSpec] = useState<string | undefined>();
    const [visSpecObject, setVisSpecObject] = useState<CustomVis['spec']>();

    // Set initial value
    useEffect(() => {
        if (chartConfig?.spec && !visSpec) {
            const serialized = serializeCustomVisualizationSpec(
                chartConfig?.spec,
            );
            if (serialized !== undefined) setVisSpec(serialized);
        }
    }, [chartConfig?.spec, visSpec]);

    // Update object when spec changes
    useEffect(() => {
        if (visSpec) {
            const parsed = parseCustomVisualizationSpec(visSpec);
            if (parsed !== undefined) setVisSpecObject(parsed);
        }
    }, [visSpec]);

    const rows = useMemo(() => resultsData?.rows, [resultsData]);

    const { series, fields } = useMemo(
        () => buildCustomVisualizationData(rows ? { rows } : undefined),
        [rows],
    );

    return {
        validConfig: { spec: visSpecObject },
        visSpec: visSpec,
        setVisSpec,
        series,
        fields,
    };
};

export default useCustomVisualizationConfig;
