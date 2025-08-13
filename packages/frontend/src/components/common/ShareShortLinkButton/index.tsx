import { ActionIcon, MantineProvider } from '@mantine-8/core';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useLocation } from 'react-router';
import { useAsyncClipboard } from '../../../hooks/useAsyncClipboard';
import { useCreateShareMutation } from '../../../hooks/useShare';
import { getMantine8ThemeOverride } from '../../../mantine8Theme';
import MantineIcon from '../MantineIcon';

const ShareShortLinkButton: FC<{
    disabled?: boolean;
    url?: { pathname: string; search: string };
}> = ({ disabled, url }) => {
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

    return (
        <MantineProvider theme={getMantine8ThemeOverride()}>
            <ActionIcon
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
        </MantineProvider>
    );
};

export default ShareShortLinkButton;
