import { type DimensionType } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import { type FC } from 'react';
import { TableFieldIcon } from './TableFields';

type Props = SelectProps & {
    fieldType: DimensionType;
};

export const FieldReferenceSelect: FC<Props> = ({ fieldType, ...props }) => {
    return (
        <Select
            radius="md"
            {...props}
            icon={<TableFieldIcon fieldType={fieldType} />}
            styles={{
                input: {
                    fontWeight: 500,
                },
                item: {
                    '&[data-selected="true"]': {
                        fontWeight: 500,
                    },
                },
            }}
        />
    );
};
