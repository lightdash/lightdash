import { type DataAppVizChart } from '@lightdash/common';
import { useCallback, useState } from 'react';

export interface DataAppVizVisualizationConfigAndData {
    validConfig: DataAppVizChart;
    dataAppVizUuid: string;
    fieldMapping: Record<string, string>;
    setDataAppVizUuid: (dataAppVizUuid: string) => void;
    setField: (fieldName: string, fieldId: string | null) => void;
}

// Local state for a data-app-viz chart (selected viz + field mapping); setters
// push each change up via `onConfigChange`. Mirrors useCustomVisualizationConfig.
const useDataAppVizVisualizationConfig = (
    initialChartConfig: DataAppVizChart | undefined,
    onConfigChange?: (config: DataAppVizChart) => void,
): DataAppVizVisualizationConfigAndData => {
    const [dataAppVizUuid, setDataAppVizUuidState] = useState<string>(
        initialChartConfig?.dataAppVizUuid ?? '',
    );
    const [fieldMapping, setFieldMappingState] = useState<
        Record<string, string>
    >(initialChartConfig?.fieldMapping ?? {});

    const setDataAppVizUuid = useCallback(
        (newDataAppVizUuid: string) => {
            // Fields are viz-specific, so switching viz drops the old mapping
            // rather than carrying over now-meaningless field names.
            setDataAppVizUuidState(newDataAppVizUuid);
            setFieldMappingState({});
            onConfigChange?.({
                dataAppVizUuid: newDataAppVizUuid,
                fieldMapping: {},
            });
        },
        [onConfigChange],
    );

    const setField = useCallback(
        (fieldName: string, fieldId: string | null) => {
            const nextMapping = { ...fieldMapping };
            if (fieldId === null) {
                delete nextMapping[fieldName];
            } else {
                nextMapping[fieldName] = fieldId;
            }
            setFieldMappingState(nextMapping);
            onConfigChange?.({ dataAppVizUuid, fieldMapping: nextMapping });
        },
        [dataAppVizUuid, fieldMapping, onConfigChange],
    );

    return {
        validConfig: { dataAppVizUuid, fieldMapping },
        dataAppVizUuid,
        fieldMapping,
        setDataAppVizUuid,
        setField,
    };
};

export default useDataAppVizVisualizationConfig;
