import { Group, Stack, Switch, Text, Title, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import classes from './SlackSettingRow.module.css';

type Props = {
    title: string;
    description: string;
    tooltip: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
};

export const SlackSettingRow: FC<Props> = ({
    title,
    description,
    tooltip,
    checked,
    disabled = false,
    onChange,
}) => (
    <Group
        className={classes.row}
        justify="space-between"
        align="center"
        wrap="nowrap"
        gap="md"
    >
        <Stack gap="two">
            <Group gap="two">
                <Title order={6} fw={500}>
                    {title}
                </Title>
                <Tooltip maw={280} label={tooltip}>
                    <MantineIcon icon={IconHelpCircle} />
                </Tooltip>
            </Group>
            <Text c="dimmed" fz="sm">
                {description}
            </Text>
        </Stack>
        <Switch
            className="ld-shrink-0"
            aria-label={title}
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.checked)}
        />
    </Group>
);
