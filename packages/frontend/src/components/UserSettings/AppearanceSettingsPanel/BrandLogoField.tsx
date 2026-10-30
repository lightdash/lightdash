import { type OrganizationBrandLogo } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconPhoto, IconUpload } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { pickBrandLogo } from '../../../hooks/organization/brandLogos';
import MantineIcon from '../../common/MantineIcon';
import classes from './BrandAppearanceSettings.module.css';
import { BrandLogoModal } from './BrandLogoModal';
import { useBrandLogoValidation } from './useBrandLogoValidation';

type Props = {
    logos: OrganizationBrandLogo[];
    brandName: string | null;
    disabled: boolean;
    onChange: (logos: OrganizationBrandLogo[]) => void;
    onErrorChange: (error: string | null) => void;
};

export const BrandLogoField: FC<Props> = ({
    logos,
    brandName,
    disabled,
    onChange,
    onErrorChange,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const logo = pickBrandLogo(logos);
    const { error, isValidating } = useBrandLogoValidation(logo?.url ?? null);

    useEffect(() => {
        onErrorChange(error ?? (isValidating ? 'Checking logo' : null));
    }, [error, isValidating, onErrorChange]);

    const replaceLogo = (url: string, format: string | null) => {
        onChange([{ type: 'logo', theme: null, url, format }]);
    };
    return (
        <Stack gap="sm">
            <Text size="sm" fw={500}>
                Logo
            </Text>
            <Group gap="md" wrap="nowrap" align="flex-start">
                <Tooltip label="Choose logo">
                    <UnstyledButton
                        className={classes.logoTile}
                        data-has-logo={!!logo}
                        disabled={disabled}
                        aria-label="Choose logo"
                        onClick={() => setIsModalOpen(true)}
                    >
                        {logo && !error ? (
                            <Box
                                component="img"
                                src={logo.url}
                                alt={`${brandName ?? 'Brand'} logo`}
                                className={classes.logoImage}
                            />
                        ) : (
                            <MantineIcon icon={IconPhoto} size="lg" />
                        )}
                    </UnstyledButton>
                </Tooltip>
                <Stack gap="xs">
                    <Group gap="xs">
                        <Button
                            variant="default"
                            size="xs"
                            disabled={disabled}
                            leftSection={<MantineIcon icon={IconUpload} />}
                            onClick={() => setIsModalOpen(true)}
                        >
                            {logo ? 'Replace image' : 'Upload image'}
                        </Button>
                        {logo && (
                            <Button
                                variant="subtle"
                                size="xs"
                                disabled={disabled}
                                onClick={() => onChange([])}
                            >
                                Remove
                            </Button>
                        )}
                    </Group>
                    <Text size="xs" c="dimmed">
                        PNG, JPG, SVG, WebP or GIF. Max 512 KB. Upload an image
                        or paste an image URL.
                    </Text>
                </Stack>
            </Group>
            {error && (
                <Text size="xs" c="red" role="alert">
                    {error}
                </Text>
            )}
            {isModalOpen && (
                <BrandLogoModal
                    logo={logo}
                    onClose={() => setIsModalOpen(false)}
                    onApply={replaceLogo}
                />
            )}
        </Stack>
    );
};
