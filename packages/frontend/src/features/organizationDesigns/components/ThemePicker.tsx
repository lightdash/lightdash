import {
    Box,
    Button,
    Group,
    Menu,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconBrush,
    IconCheck,
    IconChevronDown,
    IconSettings,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationDesigns } from '../hooks/useOrganizationDesigns';
import classes from './ThemePicker.module.css';

const LIGHTDASH_DEFAULT_LABEL = 'No theme';
// The compact trigger is a call to action when nothing is picked yet, so it
// reads as an invitation rather than a status.
const COMPACT_EMPTY_LABEL = 'Apply theme';
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

    // Compact trigger reads as a call to action until a theme is picked, then
    // switches to showing the selected theme's name.
    const compactLabel = selected ? label : COMPACT_EMPTY_LABEL;
    const button = compact ? (
        <Button
            variant="subtle"
            size="xs"
            radius="xl"
            color="gray"
            h="auto"
            py={6}
            className={classes.compactTrigger}
            data-selected={!!selected}
            onClick={() => setOpened((o) => !o)}
            disabled={disabled || lockedAfterCreation}
            leftSection={<MantineIcon icon={IconBrush} size={14} />}
            rightSection={<MantineIcon icon={IconChevronDown} size={12} />}
            aria-label={selected ? `Theme: ${label}` : COMPACT_EMPTY_LABEL}
        >
            <Group gap={5} wrap="nowrap">
                {selected && (
                    <Text
                        span
                        size="xs"
                        fw={500}
                        lh={1.2}
                        className={classes.compactPrefix}
                    >
                        Theme:
                    </Text>
                )}
                <Text span size="xs" fw={600} lh={1.2} lineClamp={1}>
                    {compactLabel}
                </Text>
            </Group>
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

    const themeOption = (
        key: string,
        optionLabel: string,
        optionDescription: string | null,
        isActive: boolean,
        onSelect: () => void,
        badge?: string,
    ) => (
        <Menu.Item
            key={key}
            onClick={onSelect}
            aria-current={isActive}
            className={classes.option}
            rightSection={
                isActive ? (
                    <MantineIcon icon={IconCheck} size={14} color="indigo.6" />
                ) : null
            }
        >
            <Group gap="xs" align="center" wrap="nowrap">
                <Text size="sm" fw={500}>
                    {optionLabel}
                </Text>
                {badge && (
                    <Text size="xs" c="dimmed">
                        {badge}
                    </Text>
                )}
            </Group>
            {optionDescription && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                    {optionDescription}
                </Text>
            )}
        </Menu.Item>
    );

    return (
        <Menu
            opened={opened}
            onChange={setOpened}
            onDismiss={() => setOpened(false)}
            position={compact ? 'top-start' : 'bottom-start'}
            offset={8}
            shadow="md"
            width={300}
            withinPortal
            closeOnItemClick
        >
            <Menu.Target>
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
            </Menu.Target>
            <Menu.Dropdown className={classes.dropdown}>
                <ScrollArea.Autosize mah={280} type="scroll">
                    {themeOption(
                        'none',
                        LIGHTDASH_DEFAULT_LABEL,
                        LIGHTDASH_DEFAULT_DESCRIPTION,
                        value === null,
                        () => onChange(null),
                    )}
                    {themes.map((theme) =>
                        themeOption(
                            theme.designUuid,
                            theme.name,
                            theme.description || null,
                            theme.designUuid === value,
                            () => onChange(theme.designUuid),
                            theme.isDefault ? 'Default' : undefined,
                        ),
                    )}
                </ScrollArea.Autosize>
                <Menu.Divider />
                <Menu.Item
                    leftSection={<MantineIcon icon={IconSettings} size={14} />}
                    onClick={() =>
                        void navigate('/generalSettings/dataApps/themes')
                    }
                >
                    <Text size="xs">Manage themes</Text>
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
