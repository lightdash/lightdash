import {
    type OrganizationBrandColor,
    type OrganizationBrandFont,
    type OrganizationBrandLogo,
} from '@lightdash/common';
import { Box, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { BrandPreview } from '../components/UserSettings/AppearanceSettingsPanel/BrandPreview';
import classes from './OrganizationSetup.module.css';

type OrganizationSetupPreviewProps = {
    domain: string;
    name: string | null;
    logos: OrganizationBrandLogo[];
    colors: OrganizationBrandColor[];
    titleFont: OrganizationBrandFont | null;
    bodyFont: OrganizationBrandFont | null;
    detectedDomain: string | null;
    detectedLogoUrl: string | null;
};

const OrganizationSetupPreview: FC<OrganizationSetupPreviewProps> = ({
    domain,
    name,
    logos,
    colors,
    titleFont,
    bodyFont,
    detectedDomain,
    detectedLogoUrl,
}) => (
    <Box className={classes.previewCard}>
        {detectedDomain && (
            <Box className={classes.pill}>
                {detectedLogoUrl && (
                    <img
                        src={detectedLogoUrl}
                        alt=""
                        className={classes.pillLogo}
                    />
                )}
                <Box className={classes.pillDot} />
                <Text size="xs" c="dimmed">
                    Theme detected from{' '}
                    <Text span fw={600} c="dimmed">
                        {detectedDomain}
                    </Text>
                </Text>
            </Box>
        )}

        <BrandPreview
            domain={domain}
            name={name}
            logos={logos}
            colors={colors}
            titleFont={titleFont}
            bodyFont={bodyFont}
        />

        <Text size="xs" c="dimmed" ta="center">
            A preview of Lightdash, themed to your brand.
        </Text>
    </Box>
);

export { OrganizationSetupPreview };
