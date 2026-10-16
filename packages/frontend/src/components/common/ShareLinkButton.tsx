import { IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyActionIcon } from './CopyActionIcon';

type ShareLinkButtonProps = {
    url: string;
    label?: string;
};

export const ShareLinkButton: FC<ShareLinkButtonProps> = ({ url, label }) => {
    const { t } = useTranslation('commonUi');
    return (
        <CopyActionIcon
            value={url}
            icon={IconLink}
            copyLabel={label ?? t('shareLinkButton.copyLink')}
            copiedLabel={t('shareLinkButton.linkCopied')}
            tooltipPosition="bottom"
            variant="default"
            size="md"
        />
    );
};
