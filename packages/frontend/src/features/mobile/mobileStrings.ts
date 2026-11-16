import { MobileSignInRefusal } from '@lightdash/common';

// The mobile apps reuse these strings, so keep every user-facing string for
// the Mobile settings page and the /m/app and /m/sign-in pages here.
export const MOBILE_STRINGS = {
    navLabel: 'Mobile',
    pageTitle: 'Mobile',
    getAppTitle: 'Get the app',
    signInTitle: 'Sign in on your phone',
    signInTo: 'Sign in to',
    waitingForScan: 'Waiting for scan',
    openedOnPhone: 'Opened on a phone',
    alreadyHaveApp: 'I already have the app',
    showCode: 'Show code',
    copyLink: 'Copy link',
    copyHost: 'Copy host',
    copied: 'Copied',
    couldNotCreateCode: "Couldn't create the code",
    tryAgain: 'Try again',
    creatingCode: 'Creating the code',
    qrCodeLabel: 'QR code to install the Lightdash app',
    storeLinksLabel: 'Store links',
    appStoreCaption: 'Download on the',
    appStoreName: 'App Store',
    googlePlayCaption: 'Get it on',
    googlePlayName: 'Google Play',
    landingTitle: 'Get the Lightdash app',
    landingHint: 'Open this link on your phone.',
} as const;

export const MOBILE_SIGN_IN_STRINGS = {
    showCode: 'Show sign-in code',
    newCode: 'Show a new code',
    anotherPhone: 'Sign in another phone',
    qrLabel: 'Sign-in QR code',
    installHint:
        'If you do not have the app, scan to open the store. Install the app, then scan again.',
    refreshed: 'New code',
    typeOnPhone: 'Type this number on your phone',
    cancel: 'Cancel',
    expired: 'Code expired',
    declined: 'Sign-in declined',
    cancelledOnPhone: 'Sign-in cancelled on the phone',
    tooManyWrongNumbers: 'Too many wrong numbers',
    signedIn: 'Signed in on a phone',
    signedInAs: (platform: string, account: string) =>
        `${platform} · ${account}`,
    confirm: {
        title: 'A phone wants to sign in as you',
        description: 'Confirm only if you just scanned this code.',
        account: 'Account',
        site: 'Site',
        device: 'Device',
        decline: 'Decline',
        approve: 'Confirm',
    },
    managed: {
        title: 'Use Microsoft sign-in in the app',
        body: 'Required by your organization.',
    },
    refusals: {
        [MobileSignInRefusal.EMAIL_UNVERIFIED]:
            'Verify your email to sign in on a phone.',
        [MobileSignInRefusal.ORGANIZATION_REQUIRED]:
            'Join an organization to sign in on a phone.',
        [MobileSignInRefusal.FEATURE_DISABLED]:
            'Phone sign-in is not available for your account.',
        [MobileSignInRefusal.RATE_LIMITED]: 'Too many codes. Try again later.',
        [MobileSignInRefusal.QR_SIGN_IN_DISABLED]:
            'Sign-in with a QR code is turned off.',
        [MobileSignInRefusal.APPROVAL_SESSION_MISMATCH]:
            'Reload the page and try again.',
        [MobileSignInRefusal.INVALID_STATE]: 'Reload the page and try again.',
    } satisfies Record<
        Exclude<
            MobileSignInRefusal,
            MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED
        >,
        string
    >,
    platforms: {
        ios: 'iOS',
        android: 'Android',
    },
    fallbackAccount: 'your account',
} as const;

export const MOBILE_SIGN_IN_LANDING_STRINGS = {
    body: 'Open the Lightdash app on this phone, then scan the code again with your phone camera.',
    cloudBody:
        'Install the app on this phone, then scan the code again with your phone camera.',
} as const;

export const MOBILE_APP_SIGN_IN_STRINGS = {
    confirmAccount: (host: string, account: string) =>
        `Sign in to ${host} as ${account}?`,
    continue: 'Continue',
    cancel: 'Cancel',
    enterNumberTitle: 'Type the number',
    enterNumberHint: 'Shown on your computer.',
    numberLabel: 'Number',
    signIn: 'Sign in',
    waitingForWeb: 'Confirm on your computer',
    wrongNumber: (triesLeft: number) =>
        triesLeft === 1
            ? 'Wrong number. 1 try left.'
            : `Wrong number. ${triesLeft} tries left.`,
    tryAgain: 'Try again',
    expiredTitle: 'Code expired',
    usedTitle: 'Code already used',
    scanNewCode: 'Scan the new code.',
    ok: 'OK',
    declinedTitle: 'Sign-in declined',
    cancelledTitle: 'Sign-in cancelled',
    managedTitle: 'Use Microsoft sign-in',
    managedBody: 'Required by your organization.',
    notAllowedTitle: 'Sign-in not allowed',
    tooManyTitle: 'Too many tries',
    tooManyBody: 'Try again later.',
    offlineTitle: 'No connection',
    offlineBody: 'Check your connection and try again.',
    unavailableTitle: 'QR sign-in is not available',
    unavailableBody: 'Sign in another way.',
    switchAccountTitle: 'Switch account?',
    switchAccountBody: (account: string, host: string) =>
        `Signed in as ${account} on ${host}.`,
    signOutAndContinue: 'Sign out and continue',
    signedInTitle: 'You’re signed in',
    chooseProject: 'Choose a project',
} as const;
