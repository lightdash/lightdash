import { getAiAgentOrbPalette } from '@lightdash/common';
import { type MantineSize } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import { AiAgentIcon } from '../AiAgentIcon';

// Mantine Avatar size scale, so the orb lines up with image avatars.
const AVATAR_SIZES: Record<MantineSize, number> = {
    xs: 16,
    sm: 26,
    md: 38,
    lg: 56,
    xl: 84,
};

type Props = {
    uuid: string;
    name: string;
    imageUrl: string | null | undefined;
    size?: number | MantineSize;
    animated?: boolean;
    calm?: boolean;
    className?: string;
};

/* Agent identity: the uploaded image when there is one, otherwise an orb
   whose colors are derived from the agent uuid (same look and hover
   animation as the brand AiAgentIcon). */
export const AgentAvatar: FC<Props> = ({
    uuid,
    name,
    imageUrl,
    size = 'sm',
    animated = false,
    calm = false,
    className,
}) => {
    const palette = useMemo(() => getAiAgentOrbPalette(uuid), [uuid]);

    if (imageUrl) {
        return (
            <LightdashUserAvatar
                size={size}
                name={name}
                src={imageUrl}
                className={className}
            />
        );
    }

    return (
        <AiAgentIcon
            size={typeof size === 'number' ? size : AVATAR_SIZES[size]}
            palette={palette}
            animated={animated}
            calm={calm}
            className={className}
        />
    );
};
