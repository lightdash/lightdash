import {
    isHexColorString,
    isSolidColorString,
    isUserAvatarGradientId,
    toSolidColor,
    USER_AVATAR_GRADIENT_IDS,
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
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconPencil } from '@tabler/icons-react';
import { type FC, useState } from 'react';
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
};

type CustomMode = 'gradient' | 'solid';

const extractHex = (value: UserAvatarColorValue | null): HexColor => {
    if (!value) return DEFAULT_COLOR;
    if (isUserAvatarGradientId(value)) return GRADIENT_SWATCH_COLORS[value];
    if (isSolidColorString(value)) return value.slice(6) as HexColor;
    return value;
};

const modeForValue = (value: UserAvatarColorValue | null): CustomMode =>
    value && isSolidColorString(value) ? 'solid' : 'gradient';

const AvatarSettings: FC = () => {
    const { user } = useApp();
    const { showToastError } = useToaster();
    const uploadMutation = useAvatarUploadMutation();
    const deleteMutation = useAvatarDeleteMutation();
    const updateUserMutation = useUserUpdateMutation();
    const [opened, { toggle, close }] = useDisclosure(false);
    const [previewValue, setPreviewValue] =
        useState<UserAvatarColorValue | null>(null);
    const [mode, setMode] = useState<CustomMode>('gradient');

    if (!user.data) return null;

    const { userUuid, firstName, lastName, avatarUrl, avatarGradient } =
        user.data;
    const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.trim();

    const handleFile = (file: File | null) => {
        if (!file) return;
        uploadMutation.mutate(file, {
            onError: (error) => {
                showToastError({
                    title: 'Failed to upload avatar',
                    subtitle: error?.error?.message ?? undefined,
                });
            },
        });
    };

    const handleToggle = () => {
        if (!opened) {
            setPreviewValue(avatarGradient ?? null);
            setMode(modeForValue(avatarGradient ?? null));
        }
        toggle();
    };

    const handleModeChange = (value: string) => {
        const nextMode = value as CustomMode;
        setMode(nextMode);
        if (previewValue && !isUserAvatarGradientId(previewValue)) {
            const hex = extractHex(previewValue);
            setPreviewValue(nextMode === 'solid' ? toSolidColor(hex) : hex);
        }
    };

    const handleColorChange = (color: string) => {
        if (!isHexColorString(color)) return;
        setPreviewValue(mode === 'solid' ? toSolidColor(color) : color);
    };

    const handlePresetClick = (gradientId: UserAvatarGradientId | null) => {
        setPreviewValue(gradientId);
    };

    const handleApply = () => {
        updateUserMutation.mutate({ avatarGradient: previewValue });
        close();
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
                <Tooltip label="Choose color">
                    <button
                        type="button"
                        aria-label="Choose avatar color"
                        className={classes.avatarEditWrapper}
                        onClick={handleToggle}
                    >
                        <LightdashUserAvatar
                            size={64}
                            userUuid={userUuid}
                            avatarGradient={avatarGradient}
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
                    <Group justify="space-between" align="center">
                        <Text size="xs" c="dimmed" fw={500}>
                            Avatar color
                        </Text>
                        <LightdashUserAvatar
                            size="sm"
                            userUuid={userUuid}
                            avatarGradient={previewValue}
                        >
                            {initials}
                        </LightdashUserAvatar>
                    </Group>
                    <SegmentedControl
                        fullWidth
                        size="xs"
                        value={mode}
                        onChange={handleModeChange}
                        data={[
                            { label: 'Gradient', value: 'gradient' },
                            { label: 'Solid', value: 'solid' },
                        ]}
                    />
                    <ColorPicker
                        format="hex"
                        size="xs"
                        fullWidth
                        value={extractHex(previewValue)}
                        onChange={handleColorChange}
                    />
                    <Stack gap={6}>
                        <Text size="xs" c="dimmed" fw={500}>
                            Lightdash presets
                        </Text>
                        <Group gap="xs" wrap="nowrap">
                            <Tooltip label="No color (default)">
                                <button
                                    type="button"
                                    aria-label="Use default avatar"
                                    className={
                                        !previewValue
                                            ? `${classes.swatchButton} ${classes.swatchSelected}`
                                            : classes.swatchButton
                                    }
                                    onClick={() => handlePresetClick(null)}
                                >
                                    <LightdashUserAvatar size="sm">
                                        {' '}
                                    </LightdashUserAvatar>
                                </button>
                            </Tooltip>
                            {USER_AVATAR_GRADIENT_IDS.map((gradientId) => (
                                <Tooltip key={gradientId} label={gradientId}>
                                    <button
                                        type="button"
                                        aria-label={`Use ${gradientId} avatar color`}
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
                            Cancel
                        </Button>
                        <Button
                            size="xs"
                            loading={updateUserMutation.isLoading}
                            onClick={handleApply}
                        >
                            Apply
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
                        Upload
                    </Button>
                )}
            </FileButton>
            {avatarUrl && (
                <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    loading={deleteMutation.isLoading}
                    onClick={() => deleteMutation.mutate()}
                >
                    Remove photo
                </Button>
            )}
        </Group>
    );
};

export default AvatarSettings;
