import { Box } from '@mantine/core';
import { useState, type FC } from 'react';
import { pickBrandLogo } from '../../hooks/organization/brandLogos';
import { useWhiteLabelBrand } from '../../hooks/organization/useWhiteLabelBrand';
import Logo from '../../svgs/logo-icon.svg?react';

export const NavBarLogo: FC = () => {
    const { brand, isResolved } = useWhiteLabelBrand();
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const logo = brand ? pickBrandLogo(brand.logos) : null;

    if (!isResolved || (logo && logo.url === failedUrl)) {
        return (
            <Box
                component="img"
                src="/favicon-neutral.svg"
                alt=""
                aria-hidden
            />
        );
    }
    if (!logo) {
        return <Logo />;
    }
    return (
        <Box
            component="img"
            src={logo.url}
            alt={brand?.name ? `${brand.name} logo` : 'logo'}
            onError={() => setFailedUrl(logo.url)}
        />
    );
};
