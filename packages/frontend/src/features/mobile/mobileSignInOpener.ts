import { createContext } from 'react';

export type MobileSignInOpener = { current: (() => void) | null };

/** Set by a layout that opens phone sign-in from a control of its own. */
export const MobileSignInOpenerContext =
    createContext<MobileSignInOpener | null>(null);
