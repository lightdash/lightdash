import { type DimensionType } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import { type FC } from 'react';
import { TableFieldIcon } from './Icons';

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
                    height: '32px',
                    fontWeight: 500,
                    borderColor: theme.colors.gray[2],
                    borderRadius: theme.radius.md,
                    boxShadow: '0px 1px 2px 0px rgba(228, 229, 231, 0.24)',
                },
                item: {
                    '&[data-selected="true"]': {
                        fontWeight: 500,
                    },
                },
            })}
            rightSectionWidth="min-content"
        />
    );
};
