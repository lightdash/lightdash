import { createContext } from 'react';

type MobileSignInDisclosure = {
    opened: boolean;
    setOpened: (opened: boolean) => void;
};

/** Set by a layout that opens phone sign-in from a control of its own. */
export const MobileSignInDisclosureContext =
    createContext<MobileSignInDisclosure | null>(null);
