import {
    generateAvatarMeshBackground,
    generateAvatarMeshBorderColor,
    getAvatarMeshClassName,
    getAvatarSolidClassName,
    getContrastTextColor,
    getHexFromSolidColor,
    hexToRgba,
    isHexColorString,
    isMeshColorString,
    isSolidColorString,
    isUserAvatarGradientId,
    parseMeshColor,
    type AvatarMeshVibe,
    type HexColor,
    type UserAvatarColorValue,
} from '@lightdash/common';
import { Avatar, type AvatarProps } from '@mantine-8/core';
import { forwardRef, Fragment } from 'react';
import classes from './Avatar.module.css';

type AvatarClassNames = Partial<
    Record<'root' | 'placeholder' | 'image', string>
>;

type Props = Omit<AvatarProps, 'classNames'> & {
    userUuid?: string;
    avatarUrl?: string | null;
    avatarGradient?: UserAvatarColorValue | null;
    classNames?: AvatarClassNames;
};

const mergeClassNames = (
    extra?: AvatarClassNames,
    extraPlaceholderClass?: string,
): AvatarClassNames => ({
    ...extra,
    root: [classes.root, extra?.root].filter(Boolean).join(' '),
    placeholder: [
        classes.placeholder,
        extraPlaceholderClass,
        extra?.placeholder,
    ]
        .filter(Boolean)
        .join(' '),
});

// No photo and no explicit gradient choice falls back to the original plain avatar.
export const LightdashUserAvatar = forwardRef<HTMLDivElement, Props>(
    ({ userUuid, avatarUrl, avatarGradient, classNames, ...props }, ref) => {
        if (avatarUrl) {
            return (
                <Avatar
                    ref={ref}
                    radius="100%"
                    color="initials"
                    src={avatarUrl}
                    imageProps={{ loading: 'lazy' }}
                    classNames={classNames}
                    {...props}
                />
            );
        }
        if (
            userUuid &&
            avatarGradient &&
            isUserAvatarGradientId(avatarGradient)
        ) {
            return (
                <Avatar
                    ref={ref}
                    radius="100%"
                    color="initials"
                    data-avatar-gradient={avatarGradient}
                    classNames={mergeClassNames(classNames)}
                    {...props}
                />
            );
        }
        const mesh: { hex: HexColor; vibe: AvatarMeshVibe } | null =
            userUuid && avatarGradient && isHexColorString(avatarGradient)
                ? { hex: avatarGradient, vibe: 0 }
                : userUuid &&
                    avatarGradient &&
                    isMeshColorString(avatarGradient)
                  ? parseMeshColor(avatarGradient)
                  : null;
        if (mesh) {
            const meshClassName = getAvatarMeshClassName(mesh.hex, mesh.vibe);
            const textColor = getContrastTextColor(mesh.hex);
            const background = generateAvatarMeshBackground(
                mesh.hex,
                mesh.vibe,
            );
            return (
                <Fragment>
                    <style>
                        {`.${classes.root}[data-avatar-gradient='custom'] .${classes.placeholder}.${meshClassName} { background-image: ${background.backgroundImage}; background-blend-mode: ${background.backgroundBlendMode}; background-size: ${background.backgroundSize}; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35), inset 0 0 3px ${generateAvatarMeshBorderColor(
                            mesh.hex,
                        )}; color: ${textColor}; }`}
                    </style>
                    <Avatar
                        ref={ref}
                        radius="100%"
                        color="initials"
                        data-avatar-gradient="custom"
                        classNames={mergeClassNames(classNames, meshClassName)}
                        {...props}
                    />
                </Fragment>
            );
        }
        if (userUuid && avatarGradient && isSolidColorString(avatarGradient)) {
            const hex = getHexFromSolidColor(avatarGradient);
            const solidClassName = getAvatarSolidClassName(hex);
            const textColor = getContrastTextColor(hex);
            return (
                <Fragment>
                    <style>
                        {`.${classes.root}[data-avatar-gradient='custom'] .${classes.placeholder}.${solidClassName} { background-image: none; background-color: ${hex}; box-shadow: inset 0 0 3px ${hexToRgba(
                            hex,
                            0.4,
                        )}; color: ${textColor}; }`}
                    </style>
                    <Avatar
                        ref={ref}
                        radius="100%"
                        color="initials"
                        data-avatar-gradient="custom"
                        classNames={mergeClassNames(classNames, solidClassName)}
                        {...props}
                    />
                </Fragment>
            );
        }
        return (
            <Avatar
                ref={ref}
                variant="light"
                radius="100%"
                color="initials"
                classNames={classNames}
                {...props}
            />
        );
    },
);
