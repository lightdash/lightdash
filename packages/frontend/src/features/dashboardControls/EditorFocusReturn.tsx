import { useEffect, type FC, type RefObject } from 'react';
import { ADD_SELECTOR } from './controlKinds';

export type FocusTarget = { pillId: string; sectionId?: string };

// The pill and this reader update together after the editor closes
export const EditorFocusReturn: FC<{
    isOpen: boolean;
    target: RefObject<FocusTarget | null>;
    findPill: (id: string) => HTMLElement | null;
}> = ({ isOpen, target, findPill }) => {
    useEffect(() => {
        const current = target.current;
        if (isOpen || current === null) return;
        target.current = null;
        const sectionAdd = current.sectionId
            ? document.querySelector<HTMLElement>(
                  `[data-section-add="${current.sectionId}"]`,
              )
            : null;
        (
            findPill(current.pillId) ??
            sectionAdd ??
            document.querySelector<HTMLElement>(ADD_SELECTOR)
        )?.focus();
    }, [isOpen, target, findPill]);
    return null;
};
