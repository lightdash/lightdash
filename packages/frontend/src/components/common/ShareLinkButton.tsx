import { ActionIcon, CopyButton, Tooltip } from '@mantine-8/core';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from './MantineIcon';

type ShareLinkButtonProps = {
    url: string;
    label?: string;
};

export const ShareLinkButton: FC<ShareLinkButtonProps> = ({
    url,
    label = 'Copy link',
}) => {
    return (
        <CopyButton value={url} timeout={2000}>
            {({ copied, copy }) => (
                <Tooltip
                    label={copied ? 'Link copied!' : label}
                    withinPortal
                    position="bottom"
                    openDelay={200}
                    transitionProps={{ transition: 'fade', duration: 150 }}
                >
                    <ActionIcon
                        variant="default"
                        onClick={copy}
                        size="md"
                        radius="md"
                    >
                        <MantineIcon
                            icon={copied ? IconCheck : IconLink}
                            color={copied ? 'green' : undefined}
                        />
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    );
};
