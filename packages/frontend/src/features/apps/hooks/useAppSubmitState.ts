import { useCallback, useRef, useState } from 'react';
import { withViewTransition } from '../utils/viewTransition';

type BeginOptions = {
    /** The submit starts from the centered landing composer, so the split
     *  layout is committed inside a view transition to morph between them. */
    fromLanding: boolean;
};

export type AppSubmitState = {
    isSubmitting: boolean;
    /** True from a landing submit until the view transition commits the
     *  split layout; keeps the landing rendered so the morph has a frame. */
    isLeavingLanding: boolean;
    /** Synchronous guard against a second submit before React re-renders. */
    isInFlight: () => boolean;
    begin: (options: BeginOptions) => void;
    end: () => void;
};

/** Client-side submit lifecycle of the app builder composer. `isSubmitting`
 *  only ever changes synchronously so `end` always lowers it, regardless of
 *  when the browser runs the view transition callback. */
export const useAppSubmitState = (): AppSubmitState => {
    const inFlight = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLeavingLanding, setIsLeavingLanding] = useState(false);

    const begin = useCallback(({ fromLanding }: BeginOptions) => {
        inFlight.current = true;
        setIsSubmitting(true);
        if (fromLanding) {
            setIsLeavingLanding(true);
            withViewTransition(() => {
                setIsLeavingLanding(false);
            });
        }
    }, []);

    const end = useCallback(() => {
        inFlight.current = false;
        setIsSubmitting(false);
    }, []);

    const isInFlight = useCallback(() => inFlight.current, []);

    return { isSubmitting, isLeavingLanding, isInFlight, begin, end };
};
