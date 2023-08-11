import { IconLink } from '@tabler/icons-react';
import { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import useToaster from '../../hooks/toaster/useToaster';
import { ShareLink } from './ShareLinkButton.styles';

const ShareLinkButton: FC<{ url: string }> = ({ url }) => {
    const { showToastSuccess } = useToaster();
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
            <ShareLink icon={<IconLink size={16} />} />
        </CopyToClipboard>
    );
};

export default ShareLinkButton;
