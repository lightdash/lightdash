import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { type Icon } from '@tabler/icons-react';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import classes from './SettingLayout.module.css';

type SettingsSectionProps = {
    label: string;
    description: string | null;
    titleAddon?: ReactNode;
};

export const SettingsSection: FC<PropsWithChildren<SettingsSectionProps>> = ({
    label,
    description,
    titleAddon,
    children,
}) => (
    <Stack gap="sm">
        <Box className={classes.measure}>
            <Group gap="xs">
                <Title order={5}>{label}</Title>
                {titleAddon}
            </Group>
            {description && (
                <Text c="dimmed" fz="xs" mt="xxs" className={classes.pretty}>
                    {description}
                </Text>
            )}
        </Box>
        {children}
    </Stack>
);

type SettingRowProps = {
    title: string;
    description: ReactNode;
    // Logos rendered before the title.
    titlePrefix?: ReactNode;
    // Badges rendered after the title.
    titleAddon?: ReactNode;
    icon?: Icon;
    // Wraps below the text when the card is narrow.
    control?: ReactNode;
};

export const SettingRow: FC<PropsWithChildren<SettingRowProps>> = ({
    title,
    description,
    titlePrefix,
    titleAddon,
    icon,
    control,
    children,
}) => (
    <Group justify="space-between" align="flex-start" gap="md">
        <Group
            wrap="nowrap"
            align="flex-start"
            gap="sm"
            className={classes.text}
        >
            {icon && <MantineIcon icon={icon} size="lg" color="ldGray.7" />}
            <Box>
                <Group gap="xs" wrap="nowrap">
                    {titlePrefix}
                    <Title order={6}>{title}</Title>
                    {titleAddon}
                </Group>
                <Text c="dimmed" fz="xs" mt="xxs" className={classes.pretty}>
                    {description}
                </Text>
                {children}
            </Box>
        </Group>
        {control}
    </Group>
);
