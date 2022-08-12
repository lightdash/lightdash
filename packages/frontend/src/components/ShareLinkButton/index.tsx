import { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useApp } from '../../providers/AppProvider';
import { ShareLink } from './ShareLinkButton.styles';

const ShareLinkButton: FC<{ url: string }> = ({ url }) => {
    const { showToastSuccess } = useApp();
    return (
        <CopyToClipboard
            text={url}
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

export default ShareLinkButton;
