import { Button, Tooltip } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
} from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    pinDevelopmentView,
    useDevelopmentView,
} from '../../../../../features/semanticStudio/developmentView';
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

/** Explore over the page with the person's changes; the app reads them only while it is open. */
export const TryIt: FC<{
    projectUuid: string;
    models: string[];
    previewProjectUuid: string | null;
    /** The pull request being tried, or null for a draft. */
    prUrl: string | null;
    onClose: () => void;
}> = ({ projectUuid, models, previewProjectUuid, prUrl, onClose }) => {
    const [isOn, setIsOn] = useDevelopmentView();
    // The preview the try started on: one that lands meanwhile would reload everything under it.
    const [preview] = useState(previewProjectUuid);
    const turnOn = useRef({ isOn, setIsOn, preview });
    useEffect(() => {
        const { isOn: wasOn, setIsOn: set, preview: tried } = turnOn.current;
        const unpin = pinDevelopmentView();
        set(true, tried);
        return () => {
            unpin();
            if (!wasOn) set(false);
        };
    }, []);
    // Explore opens once the app reads the changes, so nothing is read live first and then again.
    return isOn ? (
        <Suspense fallback={null}>
            <TryItModal
                projectUuid={projectUuid}
                models={models}
                previewProjectUuid={preview}
                prUrl={prUrl}
                onClose={onClose}
            />
        </Suspense>
    ) : null;
};

/** Tries a pull request's changes in Explore, over the page, starting on its first changed model. */
export const TryItButton: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
    look: Look;
}> = ({ projectUuid, pullRequest, look }) => {
    const { changedModels, previewProjectUuid, prUrl } = pullRequest;
    const [isTrying, setIsTrying] = useState(false);
    const stopTrying = useCallback(() => setIsTrying(false), []);
    if (changedModels.length === 0) return null;
    return (
        <>
            <Tooltip multiline w={240} label={HINT}>
                <Button
                    {...buttonProps(look)}
                    flex="none"
                    onClick={() => setIsTrying(true)}
                >
                    Try it
                </Button>
            </Tooltip>
            {isTrying ? (
                <TryIt
                    projectUuid={projectUuid}
                    models={changedModels}
                    previewProjectUuid={previewProjectUuid}
                    prUrl={prUrl}
                    onClose={stopTrying}
                />
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
