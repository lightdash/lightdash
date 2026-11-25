import { Box } from '@mantine/core';
import { useState, type FC } from 'react';
import { useWhiteLabelBrand } from '../../hooks/organization/useWhiteLabelBrand';
import Logo from '../../svgs/logo-icon.svg?react';
import LogoInk from '../../svgs/logo-ink.svg?react';

type Props = {
    /** The violet tile, or the same tile in black. */
    mark: 'tile' | 'ink';
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
        return mark === 'ink' ? <LogoInk data-mark="ink" /> : <Logo />;
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
