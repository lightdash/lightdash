import { IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { CopyActionIcon } from './CopyActionIcon';

type ShareLinkButtonProps = {
    url: string;
    label?: string;
};

export const ShareLinkButton: FC<ShareLinkButtonProps> = ({
    url,
    label = 'Copy link',
}) => {
    return (
        <CopyActionIcon
            value={url}
            icon={IconLink}
            copyLabel={label}
            copiedLabel="Link copied!"
            tooltipPosition="bottom"
            variant="default"
            size="md"
        />
    );
};
