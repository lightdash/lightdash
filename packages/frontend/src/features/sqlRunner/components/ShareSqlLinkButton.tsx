import { ActionIcon } from '@mantine/core';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAsyncClipboard } from '../../../hooks/useAsyncClipboard';
import { useCreateShareMutation } from '../../../hooks/useShare';
import { useAppSelector } from '../store/hooks';

const ShareSqlLinkButton: FC<{ disabled?: boolean }> = ({ disabled }) => {
    const location = useLocation();
    const history = useHistory();
    const { isLoading, mutateAsync: createShareUrl } = useCreateShareMutation();
    const isDisabled = disabled || isLoading;

    const sqlRunnerState = useAppSelector((state) => state.sqlRunner);
    const getSharedUrl = async () => {
        const response = await createShareUrl({
            path: location.pathname,
            params: JSON.stringify({
                ...sqlRunnerState,
            }),
        });
        history.push(`?state=${response.nanoid}`);
        return response.shareUrl;
    };
    const { handleCopy, copied } = useAsyncClipboard(getSharedUrl);

    return (
        <ActionIcon size="xs" onClick={handleCopy} disabled={isDisabled}>
            <MantineIcon
                icon={copied ? IconCheck : IconLink}
                color={copied ? 'green' : undefined}
            />
        </ActionIcon>
    );
};

export default ShareSqlLinkButton;
