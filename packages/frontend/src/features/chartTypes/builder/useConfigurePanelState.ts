import {
    type DataAppVizFieldOptionValues,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConfigurePanelState = {
    /** Only what the author explicitly changed; defaults resolve at render. */
    optionValues: DataAppVizOptionValues;
    onOptionChange: (name: string, value: DataAppVizOptionValue) => void;
    /** Per-field values keyed by the previewed field ids. */
    fieldOptionValues: DataAppVizFieldOptionValues;
    onFieldOptionChange: (
        fieldName: string,
        fieldId: string,
        optionName: string,
        value: DataAppVizOptionValue,
    ) => void;
    /** Preview-only palette pick; null follows the host's palette. */
    colorPaletteUuid: string | null;
    onPaletteChange: (colorPaletteUuid: string | null) => void;
};

/**
 * The edits a host makes in the builder's own configure panel. Reset when the
 * host moves to another viz; kept when it adopts the uuid a first build claimed.
 */
export const useConfigurePanelState = (
    dataAppVizUuid: string | null,
): ConfigurePanelState => {
    const [optionValues, setOptionValues] = useState<DataAppVizOptionValues>(
        {},
    );
    const [fieldOptionValues, setFieldOptionValues] =
        useState<DataAppVizFieldOptionValues>({});
    const [colorPaletteUuid, setColorPaletteUuid] = useState<string | null>(
        null,
    );
    const prevVizUuid = useRef(dataAppVizUuid);
    useEffect(() => {
        const prev = prevVizUuid.current;
        prevVizUuid.current = dataAppVizUuid;
        if (prev === null && dataAppVizUuid !== null) return;
        setOptionValues({});
        setFieldOptionValues({});
        setColorPaletteUuid(null);
    }, [dataAppVizUuid]);

    const onOptionChange = useCallback(
        (name: string, value: DataAppVizOptionValue) =>
            setOptionValues((prev) => ({ ...prev, [name]: value })),
        [],
    );

    const onFieldOptionChange = useCallback(
        (
            fieldName: string,
            fieldId: string,
            optionName: string,
            value: DataAppVizOptionValue,
        ) =>
            setFieldOptionValues((prev) => ({
                ...prev,
                [fieldName]: {
                    ...prev[fieldName],
                    [fieldId]: {
                        ...prev[fieldName]?.[fieldId],
                        [optionName]: value,
                    },
                },
            })),
        [],
    );

    return {
        optionValues,
        onOptionChange,
        fieldOptionValues,
        onFieldOptionChange,
        colorPaletteUuid,
        onPaletteChange: setColorPaletteUuid,
    };
};
