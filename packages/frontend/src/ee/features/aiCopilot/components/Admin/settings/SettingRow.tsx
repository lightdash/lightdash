import { Box, Group, Text, Title } from '@mantine/core';
import { type Icon } from '@tabler/icons-react';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import classes from './SettingRow.module.css';

type SettingRowProps = {
    title: string;
    description: ReactNode;
    // Badges or logos rendered next to the title.
    titleAddon?: ReactNode;
    icon?: Icon;
    // The row's control (switch, select); wraps below the text when narrow.
    control?: ReactNode;
};

/** One labelled setting inside a SettingsCard: h6 title, xs description, control. */
export const SettingRow: FC<PropsWithChildren<SettingRowProps>> = ({
    title,
    description,
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
                    <Title order={6}>{title}</Title>
                    {titleAddon}
                </Group>
                <Text c="dimmed" fz="xs" mt={2} className={classes.description}>
                    {description}
                </Text>
                {children}
            </Box>
        </Group>
        {control}
    </Group>
);
