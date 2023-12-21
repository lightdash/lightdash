import { ActionIcon } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { FC } from 'react';
import { useLocation } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCreateShareMutation } from '../../../hooks/useShare';
import MantineIcon from '../MantineIcon';

const ShareShortLinkButton: FC<{ disabled?: boolean }> = ({ disabled }) => {
    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();

    const location = useLocation();
    const { isLoading, mutateAsync: createShareUrl } = useCreateShareMutation();

    const isDisabled = disabled || isLoading;

    const handleCopyClick = async () => {
        const { shareUrl } = await createShareUrl({
            path: location.pathname,
            params: location.search,
        });
        clipboard.copy(shareUrl || '');
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
