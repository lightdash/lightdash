import { type DimensionType } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine-8/core';
import { type FC } from 'react';
import styles from './FieldReferenceSelect.module.css';
import { TableFieldIcon } from './Icons';

type Props = SelectProps & {
    fieldType: DimensionType;
};

export const FieldReferenceSelect: FC<Props> = ({ fieldType, ...props }) => {
    return (
        <Select
            radius="md"
            {...props}
            leftSection={<TableFieldIcon fieldType={fieldType} />}
            classNames={{
                input: styles.input,
                option: styles.option,
            }}
            rightSectionWidth="min-content"
        />
    );
};
