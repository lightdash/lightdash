import { Avatar, type MantineColor } from '@mantine-8/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    color: MantineColor;
    name: string;
    size?: number;
    src?: string | null;
    url: string;
};

export const AiMcpServerIcon: FC<Props> = ({
    color,
    name,
    size = 40,
    src,
    url,
}) => {
    const fallbackFaviconUrl = useMemo(() => {
        try {
            return new URL('/favicon.ico', url).toString();
        } catch {
            return undefined;
        }
    }, [url]);

    const imageSrc = src ?? fallbackFaviconUrl;

    return (
        <Avatar
            src={imageSrc}
            alt={`${name} favicon`}
            radius="md"
            size={size}
            variant="light"
            color={color}
            imageProps={{ referrerPolicy: 'no-referrer' }}
        >
            <MantineIcon icon={IconPlugConnected} size="md" />
        </Avatar>
    );
};
