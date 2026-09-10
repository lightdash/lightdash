import {
    ActionIcon,
    Anchor,
    Avatar,
    Badge,
    Breadcrumbs,
    Button,
    CloseButton,
    Group,
    Kbd,
    Loader,
    Pagination,
    Pill,
    SegmentedControl,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconPlus,
    IconSettings,
    IconTrash,
    type Icon,
} from '@tabler/icons-react';
import type { FC, ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

/**
 * Static render of every control the theme restyles through the Styles API
 * (theme/components/*.module.css). Each block covers the variants, sizes and
 * data-attribute states those CSS modules key on, so a screenshot before and
 * after a Mantine bump shows any drift in the overrides.
 */
const meta: Meta = {
    title: 'Mantine baseline/Controls',
    parameters: { layout: 'padded' },
};

export default meta;

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const BUTTON_VARIANTS = [
    'filled',
    'default',
    'light',
    'subtle',
    'outline',
    'white',
] as const;

const Section: FC<{ title: string; children: ReactNode }> = ({
    title,
    children,
}) => (
    <Stack gap="xs">
        <Title order={5}>{title}</Title>
        {children}
    </Stack>
);

const Row: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Group gap="sm" wrap="nowrap" align="center">
        <Text w={90} size="xs" c="dimmed">
            {label}
        </Text>
        <Group gap="sm">{children}</Group>
    </Group>
);

const PlusIcon: FC<{ icon?: Icon }> = ({ icon = IconPlus }) => (
    <MantineIcon icon={icon} />
);

export const Buttons: StoryObj = {
    render: () => (
        <Stack gap="xl">
            <Section title="Variants (primary colour)">
                {BUTTON_VARIANTS.map((variant) => (
                    <Row key={variant} label={variant}>
                        <Button variant={variant}>Label</Button>
                        <Button variant={variant} leftSection={<PlusIcon />}>
                            Left section
                        </Button>
                        <Button
                            variant={variant}
                            rightSection={<PlusIcon icon={IconSettings} />}
                        >
                            Right section
                        </Button>
                        <Button variant={variant} disabled>
                            Disabled
                        </Button>
                        <Button variant={variant} loading>
                            Loading
                        </Button>
                    </Row>
                ))}
            </Section>
            <Section title="Variants (color=gray keeps Mantine's muted tone)">
                {(['light', 'subtle'] as const).map((variant) => (
                    <Row key={variant} label={variant}>
                        <Button variant={variant} color="gray">
                            Gray
                        </Button>
                        <Button variant={variant} color="red">
                            Red
                        </Button>
                    </Row>
                ))}
            </Section>
            <Section title="Sizes (font stays at body size until lg)">
                {(['filled', 'default'] as const).map((variant) => (
                    <Row key={variant} label={variant}>
                        {SIZES.map((size) => (
                            <Button key={size} variant={variant} size={size}>
                                {size}
                            </Button>
                        ))}
                    </Row>
                ))}
            </Section>
        </Stack>
    ),
};

export const ActionIcons: StoryObj = {
    render: () => (
        <Stack gap="xl">
            <Section title="Variants">
                {(
                    [
                        'subtle',
                        'transparent',
                        'default',
                        'filled',
                        'light',
                    ] as const
                ).map((variant) => (
                    <Row key={variant} label={variant}>
                        <ActionIcon variant={variant}>
                            <PlusIcon icon={IconSettings} />
                        </ActionIcon>
                        <ActionIcon variant={variant} color="gray">
                            <PlusIcon icon={IconSettings} />
                        </ActionIcon>
                        <ActionIcon variant={variant} color="red">
                            <PlusIcon icon={IconTrash} />
                        </ActionIcon>
                        <ActionIcon variant={variant} disabled>
                            <PlusIcon icon={IconSettings} />
                        </ActionIcon>
                    </Row>
                ))}
            </Section>
            <Section title="Sizes and CloseButton">
                <Row label="default">
                    {SIZES.map((size) => (
                        <ActionIcon key={size} variant="default" size={size}>
                            <PlusIcon icon={IconSettings} />
                        </ActionIcon>
                    ))}
                </Row>
                <Row label="close">
                    {SIZES.map((size) => (
                        <CloseButton key={size} size={size} />
                    ))}
                    <CloseButton disabled />
                </Row>
            </Section>
        </Stack>
    ),
};

export const BadgesAndPills: StoryObj = {
    render: () => (
        <Stack gap="xl">
            <Section title="Badge (theme default: light gray, radius sm)">
                <Row label="default">
                    <Badge>Neutral</Badge>
                    <Badge color="blue">Blue</Badge>
                    <Badge color="red">Red</Badge>
                    <Badge variant="default">variant=default</Badge>
                    <Badge variant="filled">Filled</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="dot">Dot</Badge>
                </Row>
                <Row label="sizes">
                    {SIZES.map((size) => (
                        <Badge key={size} size={size}>
                            {size}
                        </Badge>
                    ))}
                </Row>
                <Row label="sections">
                    <Badge leftSection={<PlusIcon />}>Left</Badge>
                    <Badge rightSection={<PlusIcon />}>Right</Badge>
                </Row>
            </Section>
            <Section title="Pill">
                <Row label="default">
                    <Pill>Pill</Pill>
                    <Pill withRemoveButton>Removable</Pill>
                    <Pill disabled>Disabled</Pill>
                </Row>
                <Row label="outline">
                    <Pill variant="outline">Pill</Pill>
                    <Pill variant="outline" withRemoveButton>
                        Removable
                    </Pill>
                </Row>
                <Row label="sizes">
                    {SIZES.map((size) => (
                        <Pill key={size} size={size} withRemoveButton>
                            {size}
                        </Pill>
                    ))}
                </Row>
            </Section>
        </Stack>
    ),
};

export const SegmentedControls: StoryObj = {
    render: () => (
        <Stack gap="xl">
            <Section title="SegmentedControl">
                {SIZES.map((size) => (
                    <Row key={size} label={size}>
                        <SegmentedControl
                            size={size}
                            defaultValue="table"
                            data={[
                                { label: 'Chart', value: 'chart' },
                                { label: 'Table', value: 'table' },
                                { label: 'SQL', value: 'sql' },
                            ]}
                        />
                    </Row>
                ))}
                <Row label="disabled">
                    <SegmentedControl
                        disabled
                        defaultValue="a"
                        data={['a', 'b', 'c']}
                    />
                </Row>
            </Section>
            <Section title="Pagination">
                <Row label="default">
                    <Pagination total={10} value={3} />
                </Row>
                <Row label="input-sm">
                    <Pagination total={10} value={3} size="input-sm" />
                </Row>
            </Section>
        </Stack>
    ),
};

export const Miscellaneous: StoryObj = {
    render: () => (
        <Stack gap="xl">
            <Section title="Kbd">
                <Row label="kbd">
                    <Kbd>⌘</Kbd>
                    <Kbd>Enter</Kbd>
                    <Kbd>Shift</Kbd> + <Kbd>K</Kbd>
                </Row>
            </Section>
            <Section title="Avatar placeholder">
                <Row label="sizes">
                    {SIZES.map((size) => (
                        <Avatar
                            key={size}
                            size={size}
                            color="initials"
                            name="Tati Inama"
                        />
                    ))}
                    <Avatar radius="xl" />
                </Row>
            </Section>
            <Section title="Breadcrumbs">
                <Breadcrumbs>
                    <Anchor href="#">Spaces</Anchor>
                    <Anchor href="#">Finance</Anchor>
                    <Text>Revenue by month</Text>
                </Breadcrumbs>
            </Section>
            <Section title="Loader (theme registers the dots loader)">
                <Row label="types">
                    <Loader type="dots" />
                    <Loader type="oval" />
                    <Loader type="bars" />
                </Row>
                <Row label="sizes">
                    {SIZES.map((size) => (
                        <Loader key={size} type="dots" size={size} />
                    ))}
                </Row>
            </Section>
        </Stack>
    ),
};
