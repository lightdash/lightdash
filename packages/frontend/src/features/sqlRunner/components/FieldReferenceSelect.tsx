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
            styles={(theme) => ({
                input: {
                    fontWeight: 500,
                },
                item: {
                    '&[data-selected="true"]': {
                        color: theme.colors.gray[7],
                        fontWeight: 500,
                        backgroundColor: theme.colors.gray[2],
                    },
                    '&[data-selected="true"]:hover': {
                        backgroundColor: theme.colors.gray[3],
                    },
                    '&:hover': {
                        backgroundColor: theme.colors.gray[1],
                    },
                },
            })}
        />
    );
};
