// The mobile apps reuse these strings, so keep every user-facing string for
// the Mobile settings page and the /m/app landing page here.
export const MOBILE_STRINGS = {
    navLabel: 'Mobile',
    pageTitle: 'Mobile',
    getAppTitle: 'Get the app',
    signInTitle: 'Sign in on your phone',
    signInTo: (host: string) => `Sign in to ${host}.`,
    thisInstance: 'this instance',
    waitingForScan: 'Waiting for scan',
    expiresIn: (time: string) => `Expires in ${time}`,
    openedOnPhone: 'Opened on a phone',
    alreadyHaveApp: 'I already have the app',
    copyLink: 'Copy link',
    tryAgain: 'Try again',
    creatingCode: 'Creating the code',
    qrCodeLabel: 'QR code to install the Lightdash app',
    storeLinksLabel: 'Store links',
    appStoreCaption: 'Download on the',
    appStoreName: 'App Store',
    googlePlayCaption: 'Get it on',
    googlePlayName: 'Google Play',
    landingTitle: 'Get the Lightdash app',
} as const;
