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
import MantineIcon from '../../components/common/MantineIcon';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { pinDevelopmentView, useDevelopmentView } from './developmentView';
import { type StudioPullRequest } from './studioChange';

// Explore loads only when something is tried, not with every pull request card.
const loadTryItModal = () => import('./TryItModal');
const warmTryItModal = () => void loadTryItModal().catch(() => undefined);
const TryItModal = lazy(() =>
    import('./TryItModal').then(({ TryItModal: modal }) => ({
        default: modal,
    })),
);

/** Primary while it is the next step; secondary once the draft can be published. */
type Look = 'primary' | 'secondary';

const buttonProps = (look: Look) =>
    ({
        size: 'xs',
        variant: look === 'primary' ? 'filled' : 'subtle',
        color: look === 'primary' ? undefined : 'gray',
        leftSection: <MantineIcon icon={IconPlayerPlay} size={12} />,
    }) as const;

const HINT =
    'Opens Explore over this page with your changes. Only you see them until they are merged.';

/** Explore over the page with the person's changes; the app reads them only while it is open. */
const TryIt: FC<{
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
    const { track } = useTracking();
    const turnOn = useRef({
        isOn,
        setIsOn,
        preview,
        opened: () =>
            track({
                name: EventName.SEMANTIC_STUDIO_TRY_IT_OPENED,
                properties: {
                    projectId: projectUuid,
                    from: prUrl === null ? 'draft' : 'pull_request',
                    modelCount: models.length,
                },
            }),
    });
    useEffect(() => {
        const {
            isOn: wasOn,
            setIsOn: set,
            preview: tried,
            opened,
        } = turnOn.current;
        opened();
        // Switched on first, so the page keeps what it shows; then pinned, so nothing switches it off under the modal.
        set(true, tried);
        const unpin = pinDevelopmentView(tried);
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
    return (
        <>
            <Tooltip multiline w={240} label={HINT}>
                <Button
                    {...buttonProps(look)}
                    flex="none"
                    loading={isLoading}
                    onMouseEnter={warmTryItModal}
                    onFocus={warmTryItModal}
                    onClick={startTrying}
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
