import { Menu } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { type StudioPullRequest } from './studioChange';
import { TryIt } from './TryIt';

// Explore loads only when something is tried, not with every pull request card.
const loadTryItModal = () => import('./TryItModal');
export const warmTryItModal = () =>
    void loadTryItModal().catch(() => undefined);

/** Tries a pull request's changes in Explore, over the page, starting on its first changed model; null when it cannot be tried. */
export const useTryIt = (
    projectUuid: string,
    pullRequest: StudioPullRequest,
) => {
    const { changedModels, previewProjectUuid, prUrl } = pullRequest;
    const [isTrying, setIsTrying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const stopTrying = useCallback(() => setIsTrying(false), []);
    // Explore is a large download: the button says so, and the modal opens with it in hand.
    const startTrying = () => {
        setIsLoading(true);
        void loadTryItModal()
            .catch(() => undefined)
            .finally(() => {
                setIsLoading(false);
                setIsTrying(true);
            });
    };
    // Without its preview, a teammate's change would be tried as your own changes, or as live.
    if (changedModels.length === 0) return null;
    if (!pullRequest.isMine && !previewProjectUuid) return null;
    return {
        isLoading,
        startTrying,
        // Kept outside any menu, so the modal stays when the menu closes.
        modal: isTrying ? (
            <TryIt
                projectUuid={projectUuid}
                models={changedModels}
                previewProjectUuid={previewProjectUuid}
                prUrl={prUrl}
                onClose={stopTrying}
            />
        ) : null,
    };
};

/** Try it as an item of a menu, with its modal rendered by the caller outside the menu. */
export const useTryItMenuItem = (
    projectUuid: string,
    pullRequest: StudioPullRequest,
) => {
    const tryIt = useTryIt(projectUuid, pullRequest);
    return {
        item: tryIt ? (
            <Menu.Item
                leftSection={<MantineIcon icon={IconPlayerPlay} />}
                onMouseEnter={warmTryItModal}
                onClick={tryIt.startTrying}
            >
                Try it
            </Menu.Item>
        ) : null,
        modal: tryIt?.modal ?? null,
    };
};
