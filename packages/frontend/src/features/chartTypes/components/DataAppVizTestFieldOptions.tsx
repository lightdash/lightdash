import {
    getDataAppVizFieldIds,
    getItemLabelWithoutTableName,
    type DataAppVizField,
} from '@lightdash/common';
import { type FC } from 'react';
import DataAppVizFieldOptions from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizFieldOptions';
import { type DataAppVizTestContextState } from '../hooks/useDataAppVizTestContext';

type Props = {
    field: DataAppVizField;
    /** The option `group` to render; null for ungrouped options. */
    group: string | null;
    state: DataAppVizTestContextState;
};

/** The explorer's per-field option controls, fed by the test context. */
const DataAppVizTestFieldOptions: FC<Props> = ({ field, group, state }) => (
    <DataAppVizFieldOptions
        field={field}
        group={group}
        fieldIds={getDataAppVizFieldIds(state.fieldMapping[field.name])}
        getFieldLabel={(fieldId) => {
            const item = state.itemsMap[fieldId];
            return item ? getItemLabelWithoutTableName(item) : fieldId;
        }}
        values={state.fieldOptionValues[field.name] ?? {}}
        colorPalette={state.colorPalette}
        onChange={(fieldId, optionName, value) =>
            state.setFieldOption(field.name, fieldId, optionName, value)
        }
    />
);

export default DataAppVizTestFieldOptions;
