import { Box, Text } from '@mantine/core';
import { useState, type FC, type ReactNode } from 'react';
import { useWhiteLabelBrand } from '../../../hooks/organization/useWhiteLabelBrand';
import classes from './AuthBrandLogo.module.css';

type Props = {
    fallback: ReactNode;
    className?: string;
};

const AuthBrandLogo: FC<Props> = ({ fallback, className }) => {
    const { logoUrl, name, isInstanceBrandResolved } = useWhiteLabelBrand();
    const [failedUrl, setFailedUrl] = useState<string | null>(null);

    if (!isInstanceBrandResolved) return null;
    if (!logoUrl && !name) return fallback;
    const showLogo = !!logoUrl && logoUrl !== failedUrl;
    if (!showLogo && !name) return null;

    return (
        <Box className={className}>
            <Box className={classes.root}>
                {showLogo && (
                    <Box
                        component="img"
                        src={logoUrl}
                        alt={name ? `${name} logo` : 'logo'}
                        className={classes.logo}
                        onError={() => setFailedUrl(logoUrl)}
                    />
                )}
                {name && (
                    <Text c="inherit" className={classes.name}>
                        {name}
                    </Text>
                )}
            </Box>
        </Box>
    );
};

export default AuthBrandLogo;
