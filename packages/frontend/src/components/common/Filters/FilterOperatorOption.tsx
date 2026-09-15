import { type FilterOperator } from '@lightdash/common';
import { Box, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import {
    filterOperatorDescriptionKey,
    filterOperatorDropdownLabelKey,
} from './FilterInputs/constants';

type Props = {
    operator: FilterOperator;
    label: string;
};

const FilterOperatorOption: FC<Props> = ({ operator, label }) => {
    const getUiString = useUiStrings();
    const descriptionKey = filterOperatorDescriptionKey[operator];
    const description = descriptionKey
        ? getUiString(descriptionKey)
        : undefined;
    const dropdownLabelKey = filterOperatorDropdownLabelKey[operator];
    const dropdownLabel = dropdownLabelKey
        ? getUiString(dropdownLabelKey)
        : label;

    if (description) {
        return (
            <Tooltip label={description} position="right" maw={300}>
                <Box w="100%">{dropdownLabel}</Box>
            </Tooltip>
        );
    }

    return <Box w="100%">{dropdownLabel}</Box>;
};

export default FilterOperatorOption;
