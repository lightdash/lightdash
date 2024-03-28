import { Box, Group as MantineGroup, Stack, Text } from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';

interface ConfigComponent extends FC<PropsWithChildren> {
    Group: FC<PropsWithChildren>;
    Label: FC<PropsWithChildren>;
    LabelGroup: FC<PropsWithChildren>;
    SubLabel: FC<PropsWithChildren>;
}

export const Config: ConfigComponent = ({ children }) => <Box>{children}</Box>;

const Group: FC<PropsWithChildren> = ({ children }) => (
    <Stack spacing="xs">{children}</Stack>
);

const Label: FC<PropsWithChildren> = ({ children }) => (
    <Text c="gray.8" fz="sm" fw={600}>
        {children}
    </Text>
);

const SubLabel: FC<PropsWithChildren> = ({ children }) => (
    <Text fw={500} size="xs" color="gray.6">
        {children}
    </Text>
);

const LabelGroup: FC<PropsWithChildren> = ({ children }) => (
    <MantineGroup position="apart">{children}</MantineGroup>
);

Config.Group = Group;
Config.Label = Label;
Config.LabelGroup = LabelGroup;
Config.SubLabel = SubLabel;
