import { Format } from '@lightdash/common';
import { Box, Group, Select, Text } from '@mantine/core';
import { IconClearAll, IconPercentage } from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const FormatIcon: FC<{ format: string | undefined }> = ({ format }) => {
    let icon;
    switch (format) {
        case Format.PERCENT:
            icon = IconPercentage;
            break;
        default:
            icon = IconClearAll;
    }

    return <MantineIcon color={format ? 'indigo.4' : 'gray.4'} icon={icon} />;
};

type Props = {
    format: Format | undefined;
    onChangeFormat: (value: string) => void;
};

const FormatItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & { value: string; selected: boolean }
>(({ value, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group noWrap spacing="xs">
            <FormatIcon format={value === 'none' ? undefined : value} />
            <Text>{capitalize(value)}</Text>
        </Group>
    </Box>
));

export const CartesianChartFormatConfig: FC<Props> = ({
    onChangeFormat,
    format,
}) => {
    const formatOptionsWithNone = ['none', Format.PERCENT];

    return (
        <Select
            radius="md"
            data={formatOptionsWithNone.map((option) => ({
                value: option,
                label: capitalize(option),
            }))}
            itemComponent={FormatItem}
            icon={format && <FormatIcon format={format} />}
            value={format ?? formatOptionsWithNone?.[0]}
            onChange={(value) => value && onChangeFormat(value)}
            styles={(theme) => ({
                input: {
                    width: '110px',
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
