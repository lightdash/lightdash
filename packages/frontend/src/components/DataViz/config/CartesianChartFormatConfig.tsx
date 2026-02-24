import { Format } from '@lightdash/common';
import { Group, Select, Text } from '@mantine-8/core';
import { IconClearAll, IconPercentage } from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import styles from './CartesianChartFormatConfig.module.css';

const FormatIcon: FC<{ format: string | undefined }> = ({ format }) => {
    let icon;
    switch (format) {
        case Format.PERCENT:
            icon = IconPercentage;
            break;
        default:
            icon = IconClearAll;
    }

    return <MantineIcon color={format ? 'indigo.4' : 'ldGray.4'} icon={icon} />;
};

type Props = {
    format: Format | undefined;
    onChangeFormat: (value: string) => void;
};

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
            renderOption={({ option }) => (
                <Group wrap="nowrap" gap="xs">
                    <FormatIcon
                        format={
                            option.value === 'none'
                                ? undefined
                                : option.value
                        }
                    />
                    <Text>{capitalize(option.value)}</Text>
                </Group>
            )}
            leftSection={format && <FormatIcon format={format} />}
            value={format ?? formatOptionsWithNone?.[0]}
            onChange={(value) => value && onChangeFormat(value)}
            classNames={{
                input: styles.input,
                option: styles.option,
            }}
        />
    );
};
