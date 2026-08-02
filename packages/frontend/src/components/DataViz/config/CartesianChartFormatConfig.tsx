import { Format } from '@lightdash/common';
import { Group, Select, Text } from '@mantine-8/core';
import { IconClearAll, IconPercentage } from '@tabler/icons-react';
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
    const formatOptions = [
        { value: 'none', label: 'None' },
        { value: Format.PERCENT, label: 'Percent' },
        { value: Format.SI, label: 'SI' },
    ];

    return (
        <Select
            radius="md"
            data={formatOptions}
            renderOption={({ option }) => (
                <Group wrap="nowrap" gap="xs">
                    <FormatIcon
                        format={
                            option.value === 'none' ? undefined : option.value
                        }
                    />
                    <Text>{option.label}</Text>
                </Group>
            )}
            leftSection={format && <FormatIcon format={format} />}
            value={format ?? 'none'}
            onChange={(value) => value && onChangeFormat(value)}
            classNames={{
                input: styles.input,
                option: styles.option,
            }}
        />
    );
};
