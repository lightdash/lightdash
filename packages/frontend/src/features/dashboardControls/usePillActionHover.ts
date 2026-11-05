import { useState, type PointerEvent } from 'react';

// An action inside a pill (a button other than the pill, or an element
// marked `data-own-tooltip`) has a tooltip of its own: the pill's waits
// while the pointer is on it, so only one shows
export const usePillActionHover = (pillSelector: string) => {
    const [isOnAction, setIsOnAction] = useState(false);
    const trackAction = (event: PointerEvent<HTMLElement>) =>
        setIsOnAction(
            event.type === 'pointerover' &&
                event.target instanceof Element &&
                event.target.closest(
                    `button:not(${pillSelector}), [data-own-tooltip]`,
                ) !== null,
        );
    return { isOnAction, trackAction };
};
