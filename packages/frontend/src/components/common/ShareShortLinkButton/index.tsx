import { ActionIcon } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useLocation } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCreateShareMutation, useGetShare } from '../../../hooks/useShare';
import MantineIcon from '../MantineIcon';

const ShareShortLinkButton: FC<{
    disabled?: boolean;
    shareNanoId?: string;
}> = ({ disabled, shareNanoId }) => {
    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();

    const location = useLocation();
    const { isLoading, mutateAsync: createShareUrl } = useCreateShareMutation();

    /**
     * If we have a shareNanoId, we load it (likely from cache), and use that instead
     * of creating a new one.
     */
    const { data: existingShareUrl, isLoading: isLoadingExistingShareUrl } =
        useGetShare(shareNanoId);

    /**
     * If we have a shareNanoId to reuse here, we disable the button until we finish
     * loading it.
     */
    const isDisabled =
        disabled || isLoading || !!(shareNanoId && isLoadingExistingShareUrl);

    const createShare = useCallback(async () => {
        const { shareUrl } = await createShareUrl({
            path: location.pathname,
            params: location.search,
        });

        return shareUrl;
    }, [location, createShareUrl]);

    const handleCopyClick = async () => {
        const url = existingShareUrl?.shareUrl ?? (await createShare());

        clipboard.copy(url || '');
        showToastSuccess({
            title: 'Link copied to clipboard',
        });
    };

    return (
        <ActionIcon
            variant="default"
            onClick={handleCopyClick}
            disabled={isDisabled}
            color="gray"
        >
            <MantineIcon
                icon={clipboard.copied ? IconCheck : IconLink}
                color={clipboard.copied ? 'green' : undefined}
            />
        </ActionIcon>
    );
};

export default ShareShortLinkButton;
