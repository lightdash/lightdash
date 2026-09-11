import { Group, Stack, Switch, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import classes from './SlackSettingRow.module.css';

type Props = {
    title: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
};

export const SlackSettingRow: FC<Props> = ({
    title,
    description,
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
            <Title order={6}>{title}</Title>
            <Text c="dimmed" fz="xs">
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
