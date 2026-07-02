import { USER_AVATAR_GRADIENT_IDS } from '@lightdash/common';
import { Button, FileButton, Group, Tooltip } from '@mantine-8/core';
import { type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useAvatarDeleteMutation,
    useAvatarUploadMutation,
} from '../../../hooks/user/useAvatarMutations';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import useApp from '../../../providers/App/useApp';
import { LightdashUserAvatar } from '../../Avatar';
import classes from './AvatarSettings.module.css';

const AvatarSettings: FC = () => {
    const { user } = useApp();
    const { showToastError } = useToaster();
    const uploadMutation = useAvatarUploadMutation();
    const deleteMutation = useAvatarDeleteMutation();
    const updateUserMutation = useUserUpdateMutation();

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
                        Upload photo
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
            <Group gap="xs" wrap="nowrap">
                <Tooltip label="No color (default)">
                    <button
                        type="button"
                        aria-label="Use default avatar"
                        className={
                            !avatarGradient
                                ? `${classes.swatchButton} ${classes.swatchSelected}`
                                : classes.swatchButton
                        }
                        onClick={() =>
                            updateUserMutation.mutate({
                                avatarGradient: null,
                            })
                        }
                    >
                        <LightdashUserAvatar size="sm">
                            {initials}
                        </LightdashUserAvatar>
                    </button>
                </Tooltip>
                {USER_AVATAR_GRADIENT_IDS.map((gradientId) => (
                    <Tooltip key={gradientId} label={gradientId}>
                        <button
                            type="button"
                            aria-label={`Use ${gradientId} avatar color`}
                            className={
                                gradientId === avatarGradient
                                    ? `${classes.swatchButton} ${classes.swatchSelected}`
                                    : classes.swatchButton
                            }
                            onClick={() =>
                                updateUserMutation.mutate({
                                    avatarGradient: gradientId,
                                })
                            }
                        >
                            <LightdashUserAvatar
                                size="sm"
                                userUuid={userUuid}
                                avatarGradient={gradientId}
                            >
                                {initials}
                            </LightdashUserAvatar>
                        </button>
                    </Tooltip>
                ))}
            </Group>
        </Group>
    );
};

export default AvatarSettings;
