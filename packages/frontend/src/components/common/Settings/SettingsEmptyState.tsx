import { Stack, Text, Title } from '@mantine-8/core';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import MantineIcon from '../MantineIcon';
import { SettingsCard } from './SettingsCard';

type SettingsEmptyStateProps = {
    icon: TablerIconType;
    title: ReactNode;
    description: ReactNode;
};

const SettingsEmptyState: FC<PropsWithChildren<SettingsEmptyStateProps>> = ({
    icon,
    title,
    description,
    children,
}) => (
    <SettingsCard w="100%" maw="var(--page-content-width)" mx="auto">
        <Stack align="center" justify="center" gap="lg" py="3xl" px="lg">
            <MantineIcon
                icon={icon}
                color="ldGray.5"
                stroke={1.25}
                size="3xl"
            />
            <Stack align="center" gap={4} maw={480}>
                <Title order={5} ta="center">
                    {title}
                </Title>
                <Text fz="sm" c="ldGray.6" ta="center">
                    {description}
                </Text>
            </Stack>
            {children}
        </Stack>
    </SettingsCard>
);

export { SettingsEmptyState };
