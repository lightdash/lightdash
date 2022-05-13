import React, { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useApp } from '../../providers/AppProvider';
import { ShareLink } from './ShareLinkButton.styles';

const ShareLinktButton: FC = () => {
    const { showToastSuccess } = useApp();
    return (
        <CopyToClipboard
            text={window.location.href}
            options={{ message: 'Copied' }}
            onCopy={() =>
                showToastSuccess({
                    title: 'Link copied to clipboard',
                })
            }
        >
            <ShareLink icon="link" />
        </CopyToClipboard>
    );
};

export default ShareLinktButton;
