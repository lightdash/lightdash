import {
    AVATAR_MESH_VIBES,
    isHexColorString,
    isMeshColorString,
    isSolidColorString,
    isUserAvatarGradientId,
    parseMeshColor,
    toMeshColor,
    toSolidColor,
    USER_AVATAR_GRADIENT_IDS,
    type AvatarMeshVibe,
    type HexColor,
    type UserAvatarColorValue,
    type UserAvatarGradientId,
} from '@lightdash/common';
import {
    Button,
    ColorPicker,
    FileButton,
    Group,
    Popover,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowsShuffle, IconPencil } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useAvatarDeleteMutation,
    useAvatarUploadMutation,
} from '../../../hooks/user/useAvatarMutations';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import useApp from '../../../providers/App/useApp';
import { LightdashUserAvatar } from '../../Avatar';
import MantineIcon from '../../common/MantineIcon';
import classes from './AvatarSettings.module.css';

const DEFAULT_COLOR: HexColor = '#ced4da';

const GRADIENT_SWATCH_COLORS: Record<UserAvatarGradientId, HexColor> = {
    lilac: '#9d7fff',
    blush: '#ff6fc4',
    amethyst: '#5e4cff',
    sunrise: '#b3a0ff',
    slate: '#2a2a2a',
    pearl: '#e4e4ea',
};

type CustomMode = 'gradient' | 'solid';

const extractHex = (value: UserAvatarColorValue | null): HexColor => {
    if (!value) return DEFAULT_COLOR;
    if (isUserAvatarGradientId(value)) return GRADIENT_SWATCH_COLORS[value];
    if (isSolidColorString(value)) return value.slice(6) as HexColor;
    if (isMeshColorString(value)) return parseMeshColor(value).hex;
    return value;
};

const extractVibe = (value: UserAvatarColorValue | null): AvatarMeshVibe =>
    value && isMeshColorString(value) ? parseMeshColor(value).vibe : 0;

/* Vibe 0 stays encoded as a bare hex for back-compat with existing values. */
const encodeMesh = (
    hex: HexColor,
    vibe: AvatarMeshVibe,
): UserAvatarColorValue => (vibe === 0 ? hex : toMeshColor(hex, vibe));

const modeForValue = (value: UserAvatarColorValue | null): CustomMode =>
    value && isSolidColorString(value) ? 'solid' : 'gradient';

const AvatarSettings: FC = () => {
    const { t } = useTranslation('userSettings');
    const { user } = useApp();
    const { showToastError } = useToaster();
    const uploadMutation = useAvatarUploadMutation();
    const deleteMutation = useAvatarDeleteMutation();
    const updateUserMutation = useUserUpdateMutation();
    const [opened, { toggle, close }] = useDisclosure(false);
    const [previewValue, setPreviewValue] =
        useState<UserAvatarColorValue | null>(null);
    const [mode, setMode] = useState<CustomMode>('gradient');
    const [vibe, setVibe] = useState<AvatarMeshVibe>(0);

    if (!user.data) return null;

    const { userUuid, firstName, lastName, avatarUrl, avatarGradient } =
        user.data;
    const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.trim();

    const handleFile = (file: File | null) => {
        if (!file) return;
        close();
        uploadMutation.mutate(file, {
            onError: (error) => {
                showToastError({
                    title: t('profilePanel.avatarSettings.toasts.uploadFailed'),
                    subtitle: error?.error?.message ?? undefined,
                });
            },
        });
    };

    const handleToggle = () => {
        if (!opened) {
            const current = avatarGradient ?? null;
            setPreviewValue(current);
            setMode(modeForValue(current));
            setVibe(extractVibe(current));
        }
        toggle();
    };

    const handleModeChange = (value: string) => {
        const nextMode = value as CustomMode;
        setMode(nextMode);
        const hex = extractHex(previewValue);
        setPreviewValue(
            nextMode === 'solid' ? toSolidColor(hex) : encodeMesh(hex, vibe),
        );
    };

    const handleColorChange = (color: string) => {
        if (!isHexColorString(color)) return;
        setPreviewValue(
            mode === 'solid' ? toSolidColor(color) : encodeMesh(color, vibe),
        );
    };

    const handleShuffleVibe = () => {
        const hex = extractHex(previewValue);
        const otherVibes = AVATAR_MESH_VIBES.filter((v) => v !== vibe);
        const nextVibe =
            otherVibes[Math.floor(Math.random() * otherVibes.length)];
        setVibe(nextVibe);
        setPreviewValue(encodeMesh(hex, nextVibe));
    };

    const handlePresetClick = (gradientId: UserAvatarGradientId | null) => {
        setMode('gradient');
        setPreviewValue(gradientId);
    };

    const handleApply = () => {
        updateUserMutation.mutate(
            { avatarGradient: previewValue },
            {
                onSuccess: () => close(),
                onError: (error) => {
                    showToastError({
                        title: t(
                            'profilePanel.avatarSettings.toasts.updateColorFailed',
                        ),
                        subtitle: error?.error?.message ?? undefined,
                    });
                },
            },
        );
    };

    const avatarTrigger = !avatarUrl && (
        <Popover
            opened={opened}
            onChange={(isOpen) => {
                if (!isOpen) close();
            }}
            width={260}
            position="bottom-start"
            withArrow
        >
            <Popover.Target>
                <Tooltip label={t('profilePanel.avatarSettings.chooseColor')}>
                    <button
                        type="button"
                        aria-label={t(
                            'profilePanel.avatarSettings.chooseAvatarColor',
                        )}
                        className={classes.avatarEditWrapper}
                        onClick={handleToggle}
                    >
                        <LightdashUserAvatar
                            size={64}
                            userUuid={userUuid}
                            avatarGradient={
                                opened ? previewValue : avatarGradient
                            }
                        >
                            {initials}
                        </LightdashUserAvatar>
                        <span className={classes.avatarEditOverlay}>
                            <MantineIcon icon={IconPencil} color="white" />
                        </span>
                    </button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="sm">
                    <Text size="xs" c="dimmed" fw={500}>
                        {t('profilePanel.avatarSettings.avatarColor')}
                    </Text>
                    <SegmentedControl
                        fullWidth
                        size="xs"
                        value={mode}
                        onChange={handleModeChange}
                        data={[
                            {
                                label: t(
                                    'profilePanel.avatarSettings.modes.gradient',
                                ),
                                value: 'gradient',
                            },
                            {
                                label: t(
                                    'profilePanel.avatarSettings.modes.solid',
                                ),
                                value: 'solid',
                            },
                        ]}
                    />
                    <ColorPicker
                        format="hex"
                        size="xs"
                        fullWidth
                        value={extractHex(previewValue)}
                        onChange={handleColorChange}
                    />
                    {mode === 'gradient' && (
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon icon={IconArrowsShuffle} />
                            }
                            onClick={handleShuffleVibe}
                        >
                            {t('profilePanel.avatarSettings.shuffleGradient')}
                        </Button>
                    )}
                    <Stack gap={6}>
                        <Text size="xs" c="dimmed" fw={500}>
                            {t('profilePanel.avatarSettings.presets')}
                        </Text>
                        <Group gap="xs" wrap="nowrap">
                            <Tooltip
                                label={t('profilePanel.avatarSettings.noColor')}
                            >
                                <button
                                    type="button"
                                    aria-label={t(
                                        'profilePanel.avatarSettings.useDefaultAvatar',
                                    )}
                                    className={
                                        !previewValue
                                            ? `${classes.swatchButton} ${classes.swatchSelected}`
                                            : classes.swatchButton
                                    }
                                    onClick={() => handlePresetClick(null)}
                                >
                                    <span className={classes.noColorSwatch} />
                                </button>
                            </Tooltip>
                            {USER_AVATAR_GRADIENT_IDS.map((gradientId) => (
                                <Tooltip
                                    key={gradientId}
                                    label={t(
                                        `profilePanel.avatarSettings.gradients.${gradientId}`,
                                    )}
                                >
                                    <button
                                        type="button"
                                        aria-label={t(
                                            'profilePanel.avatarSettings.useGradientColor',
                                            {
                                                name: t(
                                                    `profilePanel.avatarSettings.gradients.${gradientId}`,
                                                ),
                                            },
                                        )}
                                        className={
                                            gradientId === previewValue
                                                ? `${classes.swatchButton} ${classes.swatchSelected}`
                                                : classes.swatchButton
                                        }
                                        onClick={() =>
                                            handlePresetClick(gradientId)
                                        }
                                    >
                                        <LightdashUserAvatar
                                            size="sm"
                                            userUuid={userUuid}
                                            avatarGradient={gradientId}
                                        >
                                            {' '}
                                        </LightdashUserAvatar>
                                    </button>
                                </Tooltip>
                            ))}
                        </Group>
                    </Stack>
                    <Group justify="flex-end" gap="xs">
                        <Button variant="subtle" size="xs" onClick={close}>
                            {t('actions.cancel', { ns: 'common' })}
                        </Button>
                        <Button
                            size="xs"
                            loading={updateUserMutation.isLoading}
                            onClick={handleApply}
                        >
                            {t('profilePanel.avatarSettings.apply')}
                        </Button>
                    </Group>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );

    return (
        <Group align="center" gap="md" wrap="nowrap">
            {avatarUrl ? (
                <LightdashUserAvatar
                    size={64}
                    userUuid={userUuid}
                    avatarUrl={avatarUrl}
                    avatarGradient={avatarGradient}
                >
                    {initials}
                </LightdashUserAvatar>
            ) : (
                avatarTrigger
            )}
            <FileButton
                onChange={handleFile}
                accept="image/png,image/jpeg,image/webp"
            >
                {(fileProps) => (
                    <Button
                        variant="default"
                        size="xs"
                        loading={uploadMutation.isLoading}
                        {...fileProps}
                    >
                        {t('profilePanel.avatarSettings.upload')}
                    </Button>
                )}
            </FileButton>
            {avatarUrl && (
                <Tooltip
                    label={
                        avatarGradient
                            ? t(
                                  'profilePanel.avatarSettings.removePhotoTooltipColor',
                              )
                            : t(
                                  'profilePanel.avatarSettings.removePhotoTooltipDefault',
                              )
                    }
                >
                    <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        loading={deleteMutation.isLoading}
                        onClick={() =>
                            deleteMutation.mutate(undefined, {
                                onError: (error) => {
                                    showToastError({
                                        title: t(
                                            'profilePanel.avatarSettings.toasts.removeFailed',
                                        ),
                                        subtitle:
                                            error?.error?.message ?? undefined,
                                    });
                                },
                            })
                        }
                    >
                        {t('profilePanel.avatarSettings.removePhoto')}
                    </Button>
                </Tooltip>
            )}
        </Group>
    );
};

export default AvatarSettings;
