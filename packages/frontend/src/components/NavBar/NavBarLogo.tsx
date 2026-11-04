import { Box } from '@mantine/core';
import { useState, type FC } from 'react';
import { useWhiteLabelBrand } from '../../hooks/organization/useWhiteLabelBrand';
import Logo from '../../svgs/logo-icon.svg?react';

export const NavBarLogo: FC = () => {
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
        return <Logo />;
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
