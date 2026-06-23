import {
    Box,
    Button,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationDesigns } from '../hooks/useOrganizationDesigns';
import classes from './ThemePicker.module.css';

const LIGHTDASH_DEFAULT_LABEL = 'No theme';
const LIGHTDASH_DEFAULT_DESCRIPTION =
    'No shared design assets - prompt any style you want';

type Props = {
    /**
     * Selected theme uuid. `null` means "no theme" / Lightdash default.
     */
    value: string | null;
    onChange: (designUuid: string | null) => void;
    disabled?: boolean;
    /**
     * When true, render the disabled state with a "can't change after
     * creation" tooltip. Used when the picker is shown for an existing app.
     */
    lockedAfterCreation?: boolean;
    compact?: boolean;
};

export const ThemePicker: FC<Props> = ({
    value,
    onChange,
    disabled,
    lockedAfterCreation,
    compact,
}) => {
    const navigate = useNavigate();
    const [opened, setOpened] = useState(false);
    const { data: themes = [] } = useOrganizationDesigns();

    const selected = value ? themes.find((t) => t.designUuid === value) : null;
    const label = selected?.name ?? LIGHTDASH_DEFAULT_LABEL;
    const description = selected
        ? selected.description || null
        : LIGHTDASH_DEFAULT_DESCRIPTION;

    const button = compact ? (
        <Button
            variant="default"
            size="xs"
            radius="xl"
            color="gray"
            h="auto"
            py={6}
            onClick={() => setOpened((o) => !o)}
            disabled={disabled || lockedAfterCreation}
            leftSection={<Box className={classes.swatch} />}
            rightSection={<MantineIcon icon={IconChevronDown} size={12} />}
            aria-label={`Theme: ${label}`}
        >
            <Text size="sm" fw={500} lh={1.2} lineClamp={1}>
                {label}
            </Text>
        </Button>
    ) : (
        <Button
            variant="default"
            size="xs"
            radius="md"
            color="gray"
            miw={200}
            h="auto"
            py="xs"
            justify="space-between"
            onClick={() => setOpened((o) => !o)}
            disabled={disabled || lockedAfterCreation}
            rightSection={<MantineIcon icon={IconChevronDown} size={12} />}
            aria-label={`Theme: ${label}`}
            classNames={{ label: classes.triggerWrap }}
        >
            <Stack gap={2} align="flex-start" w="100%">
                <Text size="sm" fw={600} lh={1.2} ta="left">
                    {label}
                </Text>
                {description && (
                    <Text size="xs" c="dimmed" lh={1.3} lineClamp={3} ta="left">
                        {description}
                    </Text>
                )}
            </Stack>
        </Button>
    );

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom"
            offset={8}
            shadow="md"
            trapFocus
        >
            <Popover.Target>
                {lockedAfterCreation ? (
                    <Tooltip
                        label="Theme can't be changed after creation"
                        position="top"
                        withArrow
                    >
                        {/* Tooltip needs a non-disabled wrapper to listen for
                            hover; Box renders the disabled Button inside. */}
                        <Box>{button}</Box>
                    </Tooltip>
                ) : (
                    button
                )}
            </Popover.Target>
            <Popover.Dropdown className={classes.dropdown} p={0}>
                <Box py="xs">
                    <UnstyledButton
                        className={classes.option}
                        onClick={() => {
                            onChange(null);
                            setOpened(false);
                        }}
                        aria-pressed={value === null}
                    >
                        <Box flex={1}>
                            <Group gap="xs" align="center">
                                <Text size="sm" fw={500}>
                                    {LIGHTDASH_DEFAULT_LABEL}
                                </Text>
                                {value === null && (
                                    <MantineIcon
                                        icon={IconCheck}
                                        size={14}
                                        color="indigo.6"
                                    />
                                )}
                            </Group>
                            <Text size="xs" c="dimmed">
                                {LIGHTDASH_DEFAULT_DESCRIPTION}
                            </Text>
                        </Box>
                    </UnstyledButton>
                    {themes.map((theme) => {
                        const isActive = theme.designUuid === value;
                        return (
                            <UnstyledButton
                                key={theme.designUuid}
                                className={classes.option}
                                onClick={() => {
                                    onChange(theme.designUuid);
                                    setOpened(false);
                                }}
                                aria-pressed={isActive}
                            >
                                <Box flex={1}>
                                    <Group gap="xs" align="center">
                                        <Text size="sm" fw={500}>
                                            {theme.name}
                                        </Text>
                                        {theme.isDefault && (
                                            <Text size="xs" c="dimmed">
                                                Default
                                            </Text>
                                        )}
                                        {isActive && (
                                            <MantineIcon
                                                icon={IconCheck}
                                                size={14}
                                                color="indigo.6"
                                            />
                                        )}
                                    </Group>
                                    {theme.description && (
                                        <Text size="xs" c="dimmed">
                                            {theme.description}
                                        </Text>
                                    )}
                                </Box>
                            </UnstyledButton>
                        );
                    })}
                </Box>
                <Box className={classes.footer} px="md" py="xs">
                    <UnstyledButton
                        className={classes.manageLink}
                        onClick={() => {
                            setOpened(false);
                            void navigate('/generalSettings/themes');
                        }}
                    >
                        <Text size="xs" c="blue.6">
                            Manage themes →
                        </Text>
                    </UnstyledButton>
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};
