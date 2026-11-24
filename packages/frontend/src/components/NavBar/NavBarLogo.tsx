import { Box } from '@mantine/core';
import { useState, type FC } from 'react';
import { useWhiteLabelBrand } from '../../hooks/organization/useWhiteLabelBrand';
import LogoBolt from '../../svgs/logo-bolt.svg?react';
import Logo from '../../svgs/logo-icon.svg?react';

type Props = {
    /** The violet tile, or the bolt alone in the text colour. */
    mark: 'tile' | 'bolt';
};

export const NavBarLogo: FC<Props> = ({ mark }) => {
    const { logoUrl, name, isResolved } = useWhiteLabelBrand();
    const [failedUrl, setFailedUrl] = useState<string | null>(null);

    if (!isResolved || (logoUrl && logoUrl === failedUrl)) {
        return (
            <Box
                component="img"
                src="/favicon-neutral.svg"
                alt=""
                aria-hidden
            />
        );
    }
    if (!logoUrl) {
        return mark === 'bolt' ? <LogoBolt data-mark="bolt" /> : <Logo />;
    }
    return (
        <Box
            component="img"
            src={logoUrl}
            alt={name ? `${name} logo` : 'logo'}
            onError={() => setFailedUrl(logoUrl)}
        />
    );
};
