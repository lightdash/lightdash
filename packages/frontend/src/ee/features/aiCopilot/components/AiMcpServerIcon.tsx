import { Avatar, type MantineColor } from '@mantine-8/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    color: MantineColor;
    name: string;
    size?: number;
    src?: string | null;
};

export const AiMcpServerIcon: FC<Props> = ({ color, name, size = 40, src }) => {
    const radius = Math.max(4, Math.round(size / 5));

    return (
        <Avatar
            src={src ?? undefined}
            alt={`${name} icon`}
            radius={radius}
            size={size}
            variant="light"
            color={color}
            imageProps={{ referrerPolicy: 'no-referrer' }}
        >
            <MantineIcon icon={IconPlugConnected} size="md" />
        </Avatar>
    );
};
