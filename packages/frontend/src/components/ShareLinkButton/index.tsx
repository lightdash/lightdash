import { ActionIcon } from '@mantine/core';
import { IconLink } from '@tabler/icons-react';
import { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';

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
            <ActionIcon variant="default">
                <MantineIcon icon={IconLink} />
            </ActionIcon>
        </CopyToClipboard>
    );
};

export default ShareLinkButton;
