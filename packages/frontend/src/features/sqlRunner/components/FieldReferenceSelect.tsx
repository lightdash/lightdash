import { type DimensionType } from '@lightdash/common';
import {
    Box,
    Group,
    Select,
    Text,
    Tooltip,
    type SelectProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { TableFieldIcon } from './TableFields';

const ItemComponent = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & { value: string; disabled: boolean }
>(({ value, disabled, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Tooltip
            variant="xs"
            withinPortal
            label={disabled ? 'There are no values for this column' : ''}
            disabled={!disabled}
        >
            <Group noWrap spacing="two">
                <Text>{value}</Text>
                {disabled && <MantineIcon icon={IconAlertCircle} />}
            </Group>
        </Tooltip>
    </Box>
));

type Props = SelectProps & {
    fieldType: DimensionType;
};

export const FieldReferenceSelect: FC<Props> = ({ fieldType, ...props }) => {
    return (
        <Select
            radius="md"
            {...props}
            icon={<TableFieldIcon fieldType={fieldType} />}
            itemComponent={ItemComponent}
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
