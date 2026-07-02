import {
    USER_AVATAR_GRADIENT_IDS,
    type UserAvatarGradientId,
} from '@lightdash/common';
import {
    Button,
    ColorPicker,
    Divider,
    FileButton,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { type FC, useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useAvatarDeleteMutation,
    useAvatarUploadMutation,
} from '../../../hooks/user/useAvatarMutations';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import useApp from '../../../providers/App/useApp';
import { LightdashUserAvatar } from '../../Avatar';
import classes from './AvatarSettings.module.css';

const DEFAULT_SWATCH_COLOR = '#ced4da';

const GRADIENT_SWATCH_COLORS: Record<UserAvatarGradientId, string> = {
    lilac: '#9d7fff',
    blush: '#ff6fc4',
    amethyst: '#5e4cff',
    sunrise: '#b3a0ff',
    slate: '#2a2a2a',
};

const gradientIdForColor = (color: string): UserAvatarGradientId | null =>
    USER_AVATAR_GRADIENT_IDS.find(
        (id) => GRADIENT_SWATCH_COLORS[id] === color,
    ) ?? null;

const AvatarSettings: FC = () => {
    const { user } = useApp();
    const { showToastError } = useToaster();
    const uploadMutation = useAvatarUploadMutation();
    const deleteMutation = useAvatarDeleteMutation();
    const updateUserMutation = useUserUpdateMutation();
    const [opened, { toggle, close }] = useDisclosure(false);
    const [previewGradient, setPreviewGradient] =
        useState<UserAvatarGradientId | null>(null);

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
            setPreviewGradient(avatarGradient ?? null);
        }
        toggle();
    };

    const handleApply = () => {
        updateUserMutation.mutate({ avatarGradient: previewGradient });
        close();
    };

    return (
        <Group align="center" gap="md" wrap="nowrap">
            <LightdashUserAvatar
                size={64}
                userUuid={userUuid}
                avatarUrl={avatarUrl}
                avatarGradient={avatarGradient}
            >
                {initials}
            </LightdashUserAvatar>
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
            {!avatarUrl && <Divider orientation="vertical" my="auto" h={20} />}
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
            {!avatarUrl && (
                <Popover
                    opened={opened}
                    onChange={(isOpen) => {
                        if (!isOpen) close();
                    }}
                    width={220}
                    position="bottom-start"
                    withArrow
                >
                    <Popover.Target>
                        <Tooltip label="Choose color">
                            <button
                                type="button"
                                aria-label="Choose avatar color"
                                className={classes.swatchButton}
                                onClick={handleToggle}
                            >
                                <LightdashUserAvatar
                                    size="sm"
                                    userUuid={userUuid}
                                    avatarGradient={avatarGradient}
                                >
                                    {initials}
                                </LightdashUserAvatar>
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
                                    avatarGradient={previewGradient}
                                >
                                    {initials}
                                </LightdashUserAvatar>
                            </Group>
                            <ColorPicker
                                withPicker={false}
                                format="hex"
                                swatchesPerRow={6}
                                swatches={[
                                    DEFAULT_SWATCH_COLOR,
                                    ...USER_AVATAR_GRADIENT_IDS.map(
                                        (id) => GRADIENT_SWATCH_COLORS[id],
                                    ),
                                ]}
                                value={
                                    previewGradient
                                        ? GRADIENT_SWATCH_COLORS[
                                              previewGradient
                                          ]
                                        : DEFAULT_SWATCH_COLOR
                                }
                                onChange={(color) =>
                                    setPreviewGradient(
                                        gradientIdForColor(color),
                                    )
                                }
                            />
                            <Group justify="flex-end" gap="xs">
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={close}
                                >
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
            )}
        </Group>
    );
};

export default AvatarSettings;
