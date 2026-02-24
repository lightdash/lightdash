import { type DimensionType } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine-8/core';
import { type FC } from 'react';
import { TableFieldIcon } from './Icons';
import styles from './FieldReferenceSelect.module.css';

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
