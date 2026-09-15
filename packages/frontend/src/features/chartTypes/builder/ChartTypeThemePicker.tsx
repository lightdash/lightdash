import { Button, Text, Tooltip } from '@mantine/core';
import { IconBrush, IconChevronDown } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './ChartTypeThemePicker.module.css';

type Props = {
    themeName: string;
    disabled: boolean;
    pickerOpened: boolean;
    onClick: () => void;
};

const ChartTypeThemePicker: FC<Props> = ({
    themeName,
    disabled,
    pickerOpened,
    onClick,
}) => (
    <Tooltip label={`Theme: ${themeName}`} disabled={pickerOpened}>
        <Button
            size="compact-xs"
            variant="light"
            radius="xl"
            aria-label={`Theme: ${themeName}`}
            disabled={disabled}
            onClick={onClick}
            leftSection={<MantineIcon icon={IconBrush} size={14} />}
            rightSection={<MantineIcon icon={IconChevronDown} size={12} />}
        >
            <Text span inherit truncate className={classes.themeName}>
                {themeName}
            </Text>
        </Button>
    </Tooltip>
);

export default ChartTypeThemePicker;
