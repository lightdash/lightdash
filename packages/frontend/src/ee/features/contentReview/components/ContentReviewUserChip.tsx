import { type ContentReviewUser } from '@lightdash/common';
import { Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { LightdashUserAvatar } from '../../../../components/Avatar';
import { getUserFullName, getUserInitials } from '../utils';

type Props = {
    user: ContentReviewUser;
    label?: string;
};

const ContentReviewUserChip: FC<Props> = ({ user, label }) => (
    <Group gap={6} wrap="nowrap">
        <LightdashUserAvatar size={20} userUuid={user.userUuid} fz="xs">
            {getUserInitials(user)}
        </LightdashUserAvatar>
        <Text fz="sm" fw={500} truncate="end">
            {label ?? getUserFullName(user)}
        </Text>
    </Group>
);

export default ContentReviewUserChip;
