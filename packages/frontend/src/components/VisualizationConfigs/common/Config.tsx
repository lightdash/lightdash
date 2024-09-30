import { Box, Group as MantineGroup, Stack, Text } from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';

interface ConfigComponent extends FC<PropsWithChildren> {
    Section: FC<PropsWithChildren>;
    Heading: FC<PropsWithChildren>;
    Subheading: FC<PropsWithChildren>;
    Group: FC<PropsWithChildren>;
    Label: FC<PropsWithChildren>;
}

export const Config: ConfigComponent = ({ children }) => <Box>{children}</Box>;

const Section: FC<PropsWithChildren> = ({ children }) => (
    <Stack spacing="xs">{children}</Stack>
);

const Heading: FC<PropsWithChildren> = ({ children }) => (
    <Text c="gray.8" fz="sm" fw={600}>
        {children}
    </Text>
);

const Subheading: FC<PropsWithChildren> = ({ children }) => (
    <Text c="gray.7" fz={13} fw={600}>
        {children}
    </Text>
);

const Label: FC<PropsWithChildren> = ({ children }) => (
    <Text fw={500} size="xs" color="gray.6">
        {children}
    </Text>
);

const Group: FC<PropsWithChildren> = ({ children }) => (
    <MantineGroup position="apart">{children}</MantineGroup>
);

Config.Section = Section;
Config.Heading = Heading;
Config.Subheading = Subheading;
Config.Group = Group;
Config.Label = Label;
