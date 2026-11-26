import { lazy, Suspense, useEffect, useRef, useState, type FC } from 'react';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { pinDevelopmentView, useDevelopmentView } from './developmentView';

const TryItModal = lazy(() =>
    import('./TryItModal').then(({ TryItModal: modal }) => ({
        default: modal,
    })),
);

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
