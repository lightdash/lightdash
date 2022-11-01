import copy from 'copy-to-clipboard';
import React, { FC, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCreateShareMutation } from '../../../hooks/useShare';
import { ShareLink } from './ShareShortLinkButton.styles';

const ShareShortLinkButton: FC<{ disabled?: boolean }> = ({ disabled }) => {
    const { showToastSuccess } = useToaster();

    const location = useLocation();
    const {
        isLoading,
        mutate: createShareUrl,
        data: newShareUrl,
    } = useCreateShareMutation();

    const isDisabled = disabled || isLoading;

    useEffect(() => {
        if (newShareUrl) {
            copy(newShareUrl.shareUrl || '');
            showToastSuccess({
                title: 'Link copied to clipboard',
            });
        }
    }, [newShareUrl, showToastSuccess]);

    return (
        <ShareLink
            onClick={() => {
                const shareUrl = {
                    path: location.pathname,
                    params: location.search,
                };
                createShareUrl(shareUrl);
            }}
            disabled={isDisabled}
            icon="link"
        />
    );
};

export default ShareShortLinkButton;
