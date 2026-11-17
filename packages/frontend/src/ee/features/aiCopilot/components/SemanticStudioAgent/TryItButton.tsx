import { Button, Tooltip } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { lazy, Suspense, useEffect, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useDevelopmentView } from '../../../../../features/semanticStudio/developmentView';
import {
    useStudioPullRequest,
    type StudioPullRequest,
} from './useStudioPullRequest';

// Explore loads only when something is tried, not with every pull request card.
const TryItModal = lazy(() =>
    import('./TryItModal').then(({ TryItModal: modal }) => ({
        default: modal,
    })),
);

/** Primary where it is the next step, beside Merge; quiet on a chat card. */
type Look = 'primary' | 'quiet';

const buttonProps = (look: Look) =>
    look === 'primary'
        ? {
              size: 'xs',
              variant: 'filled',
              leftSection: <MantineIcon icon={IconPlayerPlay} size={12} />,
          }
        : { size: 'compact-xs', variant: 'default' };

const HINT =
    'Opens Explore over this page with your changes. Only you see them until they are merged.';

/** Tries a pull request's changes in Explore, over the page, starting on its first changed model. */
export const TryItButton: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
    look: Look;
}> = ({ projectUuid, pullRequest, look }) => {
    const { changedModels, previewProjectUuid, prUrl } = pullRequest;
    const [isOn, setIsOn] = useDevelopmentView();
    const [isTrying, setIsTrying] = useState(false);
    const wasOn = useRef(false);
    // The app reads the changes while the modal is open, and goes back to how it was after.
    const open = () => {
        wasOn.current = isOn;
        setIsOn(true, previewProjectUuid);
        setIsTrying(true);
    };
    const close = () => {
        if (!wasOn.current) setIsOn(false);
        setIsTrying(false);
    };
    // Leaving while trying, such as the save bar swapping or going back, restores the view too.
    const restore = useRef<(() => void) | null>(null);
    restore.current = isTrying && !wasOn.current ? () => setIsOn(false) : null;
    useEffect(() => () => restore.current?.(), []);
    if (changedModels.length === 0) return null;
    return (
        <>
            <Tooltip multiline w={240} label={HINT}>
                <Button {...buttonProps(look)} flex="none" onClick={open}>
                    Try it
                </Button>
            </Tooltip>
            {isTrying ? (
                <Suspense fallback={null}>
                    <TryItModal
                        projectUuid={projectUuid}
                        models={changedModels}
                        previewProjectUuid={previewProjectUuid}
                        prUrl={prUrl}
                        onClose={close}
                    />
                </Suspense>
            ) : null}
        </>
    );
};

/** Try it on a pull request card in the chat, for the pull request Studio is working on. */
export const PullRequestCardTryIt: FC<{
    projectUuid: string;
    prUrl: string;
}> = ({ projectUuid, prUrl }) => {
    const pullRequest = useStudioPullRequest(projectUuid);
    return pullRequest?.isOpen && pullRequest.prUrl === prUrl ? (
        <TryItButton
            projectUuid={projectUuid}
            pullRequest={pullRequest}
            look="quiet"
        />
    ) : null;
};
