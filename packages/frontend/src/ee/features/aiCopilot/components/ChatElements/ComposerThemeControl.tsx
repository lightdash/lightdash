import { Button, Menu, Text, Tooltip } from '@mantine/core';
import { IconBrush, IconCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ManageThemesMenuItem } from '../../../../../features/organizationDesigns/components/ManageThemesMenuItem';
import {
    getThemeControlLabel,
    THEME_CONTROL_TOOLTIP,
    type ComposerTheme,
    type ComposerThemeOption,
} from './dataAppThemeComposer';

type Props = {
    themes: ComposerThemeOption[];
    value: ComposerTheme | null;
    onChange: (theme: ComposerTheme | null) => void;
    canManageThemes: boolean;
};

const toComposerTheme = ({ designUuid, slug, name }: ComposerThemeOption) => ({
    designUuid,
    slug,
    name,
});

/** The list of themes; the same items back the `+` submenu and the toolbar menu. */
const ThemeMenuItems: FC<Props> = ({
    themes,
    value,
    onChange,
    canManageThemes,
}) => (
    <>
        {themes.map((theme) => {
            const selected = value?.designUuid === theme.designUuid;
            return (
                <Menu.Item
                    key={theme.designUuid}
                    closeMenuOnClick={false}
                    aria-label={
                        selected
                            ? `Unselect theme ${theme.name}`
                            : `Select theme ${theme.name}`
                    }
                    onClick={() =>
                        onChange(selected ? null : toComposerTheme(theme))
                    }
                    rightSection={
                        selected ? (
                            <MantineIcon
                                icon={IconCheck}
                                size={14}
                                color="indigo.5"
                            />
                        ) : null
                    }
                >
                    <Text component="span" size="sm">
                        {theme.name}
                    </Text>
                    {theme.isDefault && (
                        <Text
                            component="span"
                            display="block"
                            size="xs"
                            c="dimmed"
                        >
                            Organization default
                        </Text>
                    )}
                </Menu.Item>
            );
        })}
        {canManageThemes && (
            <>
                <Menu.Divider role="separator" mx="sm" />
                <ManageThemesMenuItem />
            </>
        )}
    </>
);

/** Theme entry of the composer `+` menu: a submenu listing the themes. */
export const ComposerThemeMenuEntry: FC<Props> = (props) => {
    const { label, detail } = getThemeControlLabel(props.value, props.themes);
    return (
        <Menu.Sub>
            <Menu.Sub.Target>
                <Tooltip label={THEME_CONTROL_TOOLTIP} position="right">
                    <Menu.Sub.Item
                        aria-label="Apply theme"
                        leftSection={
                            <MantineIcon
                                icon={IconBrush}
                                size={14}
                                color={props.value ? 'indigo.5' : 'ldGray.6'}
                            />
                        }
                    >
                        <Text component="span" size="sm">
                            {label}
                        </Text>
                        {detail && (
                            <Text
                                component="span"
                                display="block"
                                size="xs"
                                c="dimmed"
                            >
                                {detail}
                            </Text>
                        )}
                    </Menu.Sub.Item>
                </Tooltip>
            </Menu.Sub.Target>
            <Menu.Sub.Dropdown>
                <ThemeMenuItems {...props} />
            </Menu.Sub.Dropdown>
        </Menu.Sub>
    );
};

/** Theme control on the main input, once the draft looks like a data app request. */
export const ComposerThemeButton: FC<Props> = (props) => {
    const { label, detail } = getThemeControlLabel(props.value, props.themes);
    return (
        <Menu position="top-start" width={220}>
            <Menu.Target>
                <Tooltip label={THEME_CONTROL_TOOLTIP} position="top">
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        color="gray"
                        radius="xl"
                        aria-label={detail ? `${label} (${detail})` : label}
                        leftSection={<MantineIcon icon={IconBrush} size={14} />}
                    >
                        {label}
                        {detail && (
                            <Text component="span" size="xs" c="dimmed" ml="xs">
                                · {detail}
                            </Text>
                        )}
                    </Button>
                </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
                <ThemeMenuItems {...props} />
            </Menu.Dropdown>
        </Menu>
    );
};
