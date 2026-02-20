import {
    Box,
    Group as MantineGroup,
    Stack,
    Text,
    type GroupProps,
    type TextProps,
} from '@mantine-8/core';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { type FC, type PropsWithChildren } from 'react';
import MantineIcon from '../../common/MantineIcon';

type LabelProps = PropsWithChildren &
    TextProps & {
        icon?: TablerIconType;
    };

interface ConfigComponent extends FC<PropsWithChildren> {
    Section: FC<PropsWithChildren>;
    Heading: FC<PropsWithChildren>;
    Subheading: FC<PropsWithChildren>;
    Group: FC<PropsWithChildren & GroupProps>;
    Label: FC<LabelProps>;
}

export const Config: ConfigComponent = ({ children }) => <Box>{children}</Box>;

const Section: FC<PropsWithChildren> = ({ children }) => (
    <Stack gap="xs">{children}</Stack>
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

const Label: FC<LabelProps> = ({ children, icon, ...props }) =>
    icon ? (
        <MantineGroup gap={4} wrap="nowrap">
            <MantineIcon icon={icon} size={14} color="ldGray.6" />
            <Text fw={500} fz="xs" c="ldGray.6" {...props}>
                {children}
            </Text>
        </MantineGroup>
    ) : (
        <Text fw={500} fz="xs" c="ldGray.6" {...props}>
            {children}
        </Text>
    );

const Group: FC<PropsWithChildren & GroupProps> = ({ children, ...props }) => (
    <MantineGroup justify="space-between" {...props}>
        {children}
    </MantineGroup>
);

Config.Section = Section;
Config.Heading = Heading;
Config.Subheading = Subheading;
Config.Group = Group;
Config.Label = Label;
