import { type SessionUser } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

const getUpdatedInfoKey = (hasTime: boolean, hasUser: boolean) => {
    if (hasTime && hasUser) return 'updatedInfo.lastEditedAtBy';
    if (hasTime) return 'updatedInfo.lastEditedAt';
    if (hasUser) return 'updatedInfo.lastEditedBy';
    return 'updatedInfo.lastEdited';
};

export const UpdatedInfo: FC<{
    updatedAt: Date | undefined;
    user: Partial<SessionUser> | null | undefined;
    partiallyBold?: boolean;
}> = ({ updatedAt, user, partiallyBold = true }) => {
    const { t } = useTranslation('commonUi');
    const timeAgo = useTimeAgo(updatedAt || new Date());
    const userName =
        user && user.firstName
            ? `${user.firstName} ${user.lastName ?? ''}`.trim()
            : null;

    return (
        <Text c="dimmed" fz="xs">
            <Trans
                t={t}
                i18nKey={getUpdatedInfoKey(!!updatedAt, userName !== null)}
                values={{ timeAgo, userName }}
                components={{
                    bold: (
                        <Text
                            fz="xs"
                            span
                            fw={partiallyBold ? 600 : 'default'}
                        />
                    ),
                }}
            />
        </Text>
    );
};
