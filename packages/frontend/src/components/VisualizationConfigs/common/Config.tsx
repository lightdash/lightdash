import {
    Box,
    Group as MantineGroup,
    Stack,
    Text,
    type GroupProps,
    type TextProps,
} from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';

interface ConfigComponent extends FC<PropsWithChildren> {
    Section: FC<PropsWithChildren>;
    Heading: FC<PropsWithChildren>;
    Subheading: FC<PropsWithChildren>;
    Group: FC<PropsWithChildren & GroupProps>;
    Label: FC<PropsWithChildren & TextProps>;
}

export const Config: ConfigComponent = ({ children }) => <Box>{children}</Box>;

const Section: FC<PropsWithChildren> = ({ children }) => (
    <Stack spacing="xs">{children}</Stack>
);

const Heading: FC<PropsWithChildren> = ({ children }) => (
    <Text c="ldGray.8" fz="sm" fw={600}>
        {children}
    </Text>
);

const Subheading: FC<PropsWithChildren> = ({ children }) => (
    <Text c="ldGray.7" fz={13} fw={600}>
        {children}
    </Text>
);

const Label: FC<PropsWithChildren & TextProps> = ({ children, ...props }) => (
    <Text fw={500} size="xs" color="ldGray.6" {...props}>
        {children}
    </Text>
);

const Group: FC<PropsWithChildren & GroupProps> = ({ children, ...props }) => (
    <MantineGroup position="apart" {...props}>
        {children}
    </MantineGroup>
);

Config.Section = Section;
Config.Heading = Heading;
Config.Subheading = Subheading;
Config.Group = Group;
Config.Label = Label;
