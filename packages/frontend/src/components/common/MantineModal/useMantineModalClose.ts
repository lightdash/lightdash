import { createContext, useContext } from 'react';

type MantineModalCloseValue = {
    /**
     * Closes the modal the way its own close button does: the unsaved-changes
     * confirmation first when the host set `confirmBeforeClose`, else `onClose`.
     */
    requestClose: () => void;
};

export const MantineModalContext = createContext<MantineModalCloseValue | null>(
    null,
);

/** Lets a control inside a MantineModal close it through the modal's own path. */
export const useMantineModalClose = (): MantineModalCloseValue => {
    const context = useContext(MantineModalContext);
    if (!context) {
        throw new Error(
            'useMantineModalClose must be used inside a MantineModal',
        );
    }
    return context;
};
