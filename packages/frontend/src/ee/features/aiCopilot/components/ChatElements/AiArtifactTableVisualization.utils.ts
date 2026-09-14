import {
    ChartKind,
    type ResultColumn,
    type VizTableConfig,
} from '@lightdash/common';

export const getAiArtifactTableConfig = (
    columns: ResultColumn[],
): VizTableConfig => ({
    metadata: { version: 1 },
    type: ChartKind.TABLE,
    columns: Object.fromEntries(
        columns.map((column) => [
            column.reference,
            {
                visible: true,
                reference: column.reference,
                label: column.reference,
                frozen: false,
            },
        ]),
    ),
    display: undefined,
});
