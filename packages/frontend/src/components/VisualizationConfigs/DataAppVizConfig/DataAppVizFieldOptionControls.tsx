import {
    getItemId,
    getItemLabelWithoutTableName,
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
    type Item,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import DataAppVizOptionControl from './DataAppVizOptionControl';

type Props = {
    /** The slot's per-field option declarations. */
    options: DataAppVizConfigOption[];
    /** The field ids bound to the slot, in binding order. */
    fieldIds: string[];
    /** Where bound fields' labels are looked up. */
    items: Item[];
    /** Effective values keyed by field id. */
    values: Record<string, DataAppVizOptionValues>;
    colorPalette: string[];
    onChange: (
        fieldId: string,
        optionName: string,
        value: DataAppVizOptionValue,
    ) => void;
};

/** One labelled group of a slot's per-field settings for each bound field. */
const DataAppVizFieldOptionControls: FC<Props> = ({
    options,
    fieldIds,
    items,
    values,
    colorPalette,
    onChange,
}) => {
    if (options.length === 0) return null;
    return (
        <>
            {fieldIds.map((fieldId) => {
                const item = items.find(
                    (candidate) => getItemId(candidate) === fieldId,
                );
                return (
                    <Stack key={fieldId} gap="xs" mt="sm">
                        <Text size="xs" fw={600}>
                            {item
                                ? getItemLabelWithoutTableName(item)
                                : fieldId}
                        </Text>
                        {options.map((option) => (
                            <DataAppVizOptionControl
                                key={option.name}
                                option={option}
                                value={values[fieldId]?.[option.name]}
                                colorPalette={colorPalette}
                                onChange={(value) =>
                                    onChange(fieldId, option.name, value)
                                }
                            />
                        ))}
                    </Stack>
                );
            })}
        </>
    );
};

export default DataAppVizFieldOptionControls;
