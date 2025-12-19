import { ActionIcon, Tooltip } from '@mantine-8/core';
import { useClipboard } from '@mantine/hooks';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../MantineIcon';

export const ShareLinkButtonV2: FC<{ url: string }> = ({ url }) => {
    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();

    const handleCopyClick = () => {
        clipboard.copy(url || '');
        showToastSuccess({
            title: 'Link copied to clipboard',
        });
    };

    return (
        <Tooltip
            label="Copy link to the dashboard"
            withinPortal
            position="bottom"
            openDelay={200}
            transitionProps={{ transition: 'fade', duration: 150 }}
        >
            <ActionIcon
                variant="default"
                onClick={handleCopyClick}
                size="md"
                radius="md"
            >
                <MantineIcon
                    icon={clipboard.copied ? IconCheck : IconLink}
                    color={clipboard.copied ? 'green' : undefined}
                />
            </ActionIcon>
        </Tooltip>
    );
};
