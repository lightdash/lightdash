import { ActionIcon } from '@mantine/core';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useLocation } from 'react-router-dom';
import { useAsyncClipboard } from '../../../hooks/useAsyncClipboard';
import { useCreateShareMutation } from '../../../hooks/useShare';
import MantineIcon from '../MantineIcon';

const ShareShortLinkButton: FC<{ disabled?: boolean }> = ({ disabled }) => {
    const location = useLocation();

    const { isLoading, mutateAsync: createShareUrl } = useCreateShareMutation();
    const isDisabled = disabled || isLoading;

    const getSharedUrl = async () => {
        const response = await createShareUrl({
            path: location.pathname,
            params: location.search,
        });
        return response.shareUrl;
    };
    const { handleCopy, copied } = useAsyncClipboard(getSharedUrl);

    return (
        <ActionIcon
            variant="default"
            onClick={handleCopy}
            disabled={isDisabled}
            color="gray"
        >
            <MantineIcon
                icon={copied ? IconCheck : IconLink}
                color={copied ? 'green' : undefined}
            />
        </ActionIcon>
    );
};

export default ShareShortLinkButton;
