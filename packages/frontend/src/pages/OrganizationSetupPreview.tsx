import {
    type OrganizationBrandColor,
    type OrganizationBrandFont,
    type OrganizationBrandLogo,
} from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { BrandPreview } from '../components/UserSettings/AppearanceSettingsPanel/BrandPreview';
import classes from './OrganizationSetup.module.css';

type OrganizationSetupPreviewProps = {
    name: string | null;
    logos: OrganizationBrandLogo[];
    colors: OrganizationBrandColor[];
    titleFont: OrganizationBrandFont | null;
    bodyFont: OrganizationBrandFont | null;
    detectedDomain: string | null;
    detectedLogoUrl: string | null;
};

const OrganizationSetupPreview: FC<OrganizationSetupPreviewProps> = ({
    name,
    logos,
    colors,
    titleFont,
    bodyFont,
    detectedDomain,
    detectedLogoUrl,
}) => {
    const { t } = useTranslation('pages');
    return (
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
                        <Trans
                            t={t}
                            i18nKey="organizationSetup.themeDetectedFrom"
                            values={{ domain: detectedDomain }}
                            components={{
                                domain: <Text span fw={600} c="dimmed" />,
                            }}
                        />
                    </Text>
                </Box>
            )}

            <BrandPreview
                name={name}
                logos={logos}
                colors={colors}
                titleFont={titleFont}
                bodyFont={bodyFont}
            />

            <Text size="xs" c="dimmed" ta="center">
                {t('organizationSetup.previewCaption')}
            </Text>
        </Box>
    );
};

export { OrganizationSetupPreview };
