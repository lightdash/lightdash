import { ActionIcon } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../MantineIcon';

const ShareLinkButton: FC<{ url: string }> = ({ url }) => {
    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();

    const handleCopyClick = async () => {
        clipboard.copy(url || '');
        showToastSuccess({
            title: 'Link copied to clipboard',
        });
    };

    return (
        <ActionIcon variant="default" onClick={handleCopyClick} color="gray">
            <MantineIcon
                icon={clipboard.copied ? IconCheck : IconLink}
                color={clipboard.copied ? 'green' : undefined}
            />
        </ActionIcon>
    );
};

export default ShareLinkButton;
