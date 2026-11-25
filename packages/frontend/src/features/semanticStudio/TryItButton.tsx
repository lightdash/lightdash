import { Button, Tooltip } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { type StudioPullRequest } from './studioChange';
import { useTryIt, warmTryItModal } from './useTryIt';

const HINT =
    'Opens Explore over this page with your changes. Only you see them until they are merged.';

export const TryItButton: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
}> = ({ projectUuid, pullRequest }) => {
    const tryIt = useTryIt(projectUuid, pullRequest);
    if (!tryIt) return null;
    return (
        <>
            <Tooltip multiline w={240} label={HINT}>
                <Button
                    size="xs"
                    leftSection={
                        <MantineIcon icon={IconPlayerPlay} size={12} />
                    }
                    flex="none"
                    loading={tryIt.isLoading}
                    onMouseEnter={warmTryItModal}
                    onFocus={warmTryItModal}
                    onClick={tryIt.startTrying}
                >
                    Try it
                </Button>
            </Tooltip>
            {tryIt.modal}
        </>
    );
};
