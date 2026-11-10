import { MOBILE_SIGN_IN_PATH } from '@lightdash/common';

export const stripMobileSignInFragment = (
    target: Pick<Window, 'location' | 'history'>,
): void => {
    if (target.location.pathname !== MOBILE_SIGN_IN_PATH) return;
    target.history.replaceState(
        target.history.state,
        '',
        `${target.location.pathname}${target.location.search}`,
    );
};

if (typeof window !== 'undefined') stripMobileSignInFragment(window);
