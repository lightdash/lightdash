import {
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConfigurePanelState = {
    /** Only what the author explicitly changed; defaults resolve at render. */
    optionValues: DataAppVizOptionValues;
    onOptionChange: (name: string, value: DataAppVizOptionValue) => void;
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
    const [colorPaletteUuid, setColorPaletteUuid] = useState<string | null>(
        null,
    );
    const prevVizUuid = useRef(dataAppVizUuid);
    useEffect(() => {
        const prev = prevVizUuid.current;
        prevVizUuid.current = dataAppVizUuid;
        if (prev === null && dataAppVizUuid !== null) return;
        setOptionValues({});
        setColorPaletteUuid(null);
    }, [dataAppVizUuid]);

    const onOptionChange = useCallback(
        (name: string, value: DataAppVizOptionValue) =>
            setOptionValues((prev) => ({ ...prev, [name]: value })),
        [],
    );

    return {
        optionValues,
        onOptionChange,
        colorPaletteUuid,
        onPaletteChange: setColorPaletteUuid,
    };
};
