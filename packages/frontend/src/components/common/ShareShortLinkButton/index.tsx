import { ActionIcon, Button } from '@mantine/core';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useAsyncClipboard } from '../../../hooks/useAsyncClipboard';
import { useCreateShareMutation } from '../../../hooks/useShare';
import MantineIcon from '../MantineIcon';

const ShareShortLinkButton: FC<{
    disabled?: boolean;
    withLabel?: boolean;
    url?: { pathname: string; search: string };
}> = ({ disabled, url, withLabel = false }) => {
    const { t } = useTranslation('commonUi');
    const location = useLocation();

    const { isLoading, mutateAsync: createShareUrl } = useCreateShareMutation();
    const isDisabled = disabled || isLoading;

    const getSharedUrl = async () => {
        const response = await createShareUrl({
            path: url?.pathname ?? location.pathname,
            params: url?.search ?? location.search,
        });
        return response.shareUrl;
    };
    const { handleCopy, copied } = useAsyncClipboard(getSharedUrl);

    if (withLabel) {
        return (
            <Button
                variant="subtle"
                onClick={handleCopy}
                disabled={isDisabled}
                aria-label={
                    copied
                        ? t('shareShortLinkButton.linkCopied')
                        : t('shareShortLinkButton.copyShareLink')
                }
                leftSection={
                    <MantineIcon icon={copied ? IconCheck : IconLink} />
                }
            >
                {copied
                    ? t('feedback.copiedShort', { ns: 'common' })
                    : t('shareShortLinkButton.share')}
            </Button>
        );
    }

    return (
        <ActionIcon
            aria-label={
                copied
                    ? t('shareShortLinkButton.linkCopied')
                    : t('shareShortLinkButton.copyShareLink')
            }
            variant="default"
            onClick={handleCopy}
            disabled={isDisabled}
            color="gray"
        >
            <MantineIcon
                icon={copied ? IconCheck : IconLink}
                color={copied ? 'green' : undefined}
            />
        </ActionIcon>
    );
};

export default ShareShortLinkButton;
