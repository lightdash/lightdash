import {
    MAX_ORGANIZATION_BRAND_LOGO_BYTES,
    type OrganizationBrandLogo,
} from '@lightdash/common';
import { Box, Divider, Loader, Stack, Text, TextInput } from '@mantine/core';
import { IconLink, IconPhoto } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useUploadOrganizationBrandLogo } from '../../../hooks/organization/useOrganizationBrand';
import Callout from '../../common/Callout';
import FileDropzone from '../../common/FileDropzone/FileDropzone';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import classes from './BrandLogoModal.module.css';
import { useBrandLogoValidation } from './useBrandLogoValidation';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';

const isImageUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
};

export const BrandLogoModal: FC<{
    logo: OrganizationBrandLogo | null;
    onClose: () => void;
    onApply: (url: string, format: string | null) => void;
}> = ({ logo, onClose, onApply }) => {
    const uploadMutation = useUploadOrganizationBrandLogo();
    const [file, setFile] = useState<{ file: File; url: string } | null>(null);
    const [url, setUrl] = useState(
        logo && isImageUrl(logo.url) ? logo.url : '',
    );
    const [hasSelection, setHasSelection] = useState(false);
    const [selectionError, setSelectionError] = useState<string | null>(null);
    const urlError =
        url.trim() && !isImageUrl(url.trim())
            ? 'Enter an image URL starting with https:// or http://'
            : null;
    const previewUrl =
        file?.url ??
        (hasSelection
            ? urlError
                ? null
                : url.trim() || null
            : (logo?.url ?? null));
    const { error: imageError, isValidating } =
        useBrandLogoValidation(previewUrl);
    const error = selectionError ?? urlError ?? imageError;

    useEffect(() => {
        return () => {
            if (file) URL.revokeObjectURL(file.url);
        };
    }, [file]);

    const handleFiles = (files: File[]) => {
        if (files.length === 0) return;
        if (files.length !== 1) {
            setSelectionError('Choose one image at a time');
            return;
        }
        const selected = files[0];
        if (!ACCEPT.split(',').includes(selected.type)) {
            setSelectionError('Choose a PNG, JPG, SVG, WebP or GIF image');
            return;
        }
        if (selected.size > MAX_ORGANIZATION_BRAND_LOGO_BYTES) {
            setSelectionError('Image must be 512 KB or smaller');
            return;
        }
        setSelectionError(null);
        setUrl('');
        setFile({ file: selected, url: URL.createObjectURL(selected) });
        setHasSelection(true);
        uploadMutation.reset();
    };

    const canApply =
        hasSelection &&
        !!previewUrl &&
        !error &&
        !isValidating &&
        !uploadMutation.isLoading;
    const handleApply = () => {
        if (!canApply || !previewUrl) return;
        if (file) {
            uploadMutation.mutate(file.file, {
                onSuccess: (uploaded) => {
                    onApply(uploaded.url, uploaded.format);
                    onClose();
                },
            });
        } else {
            const extension =
                previewUrl
                    .match(/\.(svg|png|jpe?g|webp|gif)(\?|#|$)/i)?.[1]
                    .toLowerCase() ?? null;
            onApply(previewUrl, extension === 'jpg' ? 'jpeg' : extension);
            onClose();
        }
    };

    return (
        <MantineModal
            opened
            title={logo ? 'Replace brand logo' : 'Add brand logo'}
            subtitle="Choose an image for your navigation bar and browser tab."
            icon={IconPhoto}
            size="lg"
            onClose={() => {
                if (!uploadMutation.isLoading) onClose();
            }}
            onConfirm={handleApply}
            confirmLabel="Use image"
            confirmDisabled={!canApply}
            confirmLoading={uploadMutation.isLoading}
            cancelDisabled={uploadMutation.isLoading}
        >
            <Stack gap="md">
                <Box className={classes.layout}>
                    <Stack gap="md">
                        <FileDropzone
                            accept={ACCEPT}
                            multiple={false}
                            description="PNG, JPG, SVG, WebP or GIF · Up to 512 KB"
                            disabled={uploadMutation.isLoading}
                            onFiles={handleFiles}
                        />
                        <Divider
                            label="or paste an image URL"
                            labelPosition="center"
                        />
                        <TextInput
                            label="Image URL"
                            placeholder="https://acme.com/logo.svg"
                            leftSection={<MantineIcon icon={IconLink} />}
                            value={url}
                            disabled={uploadMutation.isLoading}
                            onChange={(event) => {
                                setUrl(event.currentTarget.value);
                                setFile(null);
                                setSelectionError(null);
                                setHasSelection(true);
                                uploadMutation.reset();
                            }}
                        />
                    </Stack>
                    <Stack
                        align="center"
                        gap="sm"
                        className={classes.previewColumn}
                    >
                        <Text size="sm" fw={500}>
                            Logo preview
                        </Text>
                        <Box
                            className={classes.preview}
                            aria-label="Logo preview"
                        >
                            {isValidating ? (
                                <Loader size="sm" />
                            ) : previewUrl && !imageError ? (
                                <Box
                                    component="img"
                                    src={previewUrl}
                                    alt="Selected logo preview"
                                    className={classes.image}
                                />
                            ) : (
                                <MantineIcon
                                    icon={IconPhoto}
                                    size="xl"
                                    color="dimmed"
                                />
                            )}
                        </Box>
                        <Text size="xs" c="dimmed" ta="center">
                            Choose an image that reads well on light and dark
                            backgrounds.
                        </Text>
                        {file && (
                            <Text
                                size="xs"
                                c="dimmed"
                                lineClamp={2}
                                className={classes.filename}
                            >
                                {file.file.name}
                            </Text>
                        )}
                    </Stack>
                </Box>
                {error && <Callout variant="danger">{error}</Callout>}
                {uploadMutation.isError && (
                    <Callout variant="danger">
                        Upload failed. Try again or choose another image.
                    </Callout>
                )}
            </Stack>
        </MantineModal>
    );
};
