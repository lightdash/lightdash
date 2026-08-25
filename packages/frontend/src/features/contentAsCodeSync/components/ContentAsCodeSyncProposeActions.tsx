import { Box, Button, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useContentAsCodeWriteBackStatus } from '../hooks/useContentAsCodeWriteBackStatus';
import { type ContentAsCodeSyncItem } from '../types';
import { canProposeContentAsCodeSyncItem } from '../utils/contentAsCodeSyncState';

type ContentAsCodeSyncProposeActionsProps = {
    projectUuid: string;
    item: ContentAsCodeSyncItem;
    isProposeAvailable: boolean;
    isProposing: boolean;
    onPropose: () => void;
};

const proposeLabel = (state: ContentAsCodeSyncItem['state']): string =>
    state === 'ui_only' ? 'Add to git' : 'Propose to git';

const ContentAsCodeSyncProposeActions: FC<
    ContentAsCodeSyncProposeActionsProps
> = ({ projectUuid, item, isProposeAvailable, isProposing, onPropose }) => {
    const canProposeNow = canProposeContentAsCodeSyncItem(item.state);
    const statusQuery = useContentAsCodeWriteBackStatus(
        projectUuid,
        item.contentType,
        item.slug,
        canProposeNow,
    );

    if (!canProposeNow) {
        return null;
    }

    if (statusQuery.isInitialLoading) {
        return null;
    }

    const result = statusQuery.data;
    if (!result || result.kind === 'unavailable') {
        return null;
    }

    const { status } = result;
    if (status.state === 'unavailable' || !status.writeBackEnabled) {
        return null;
    }

    if (status.writeBack.prState === 'merged') {
        return (
            <Button variant="default" size="xs" disabled>
                Merged, applies on the next deploy
            </Button>
        );
    }

    const proposeDisabled = !isProposeAvailable;
    const disabledReason = isProposeAvailable
        ? null
        : 'The API is not available yet.';

    return (
        <>
            {status.writeBack.prState === 'open' && status.writeBack.prUrl ? (
                <Button
                    variant="default"
                    size="xs"
                    component="a"
                    href={status.writeBack.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Open pull request
                </Button>
            ) : null}
            <Tooltip label={disabledReason} disabled={!disabledReason}>
                <Box>
                    <Button
                        variant="default"
                        size="xs"
                        disabled={proposeDisabled}
                        loading={isProposing}
                        onClick={onPropose}
                    >
                        {proposeLabel(item.state)}
                    </Button>
                </Box>
            </Tooltip>
        </>
    );
};

export default ContentAsCodeSyncProposeActions;
