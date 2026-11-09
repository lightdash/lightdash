// The mobile apps reuse these strings, so keep every user-facing string for
// the Mobile settings page here.
export const MOBILE_STRINGS = {
    navLabel: 'Mobile',
    pageTitle: 'Mobile',
    getAppTitle: 'Get the app',
    signInTo: (host: string) => `Sign in to ${host}.`,
    storeLinksLabel: 'Store links',
    appStoreCaption: 'Download on the',
    appStoreName: 'App Store',
    googlePlayCaption: 'Get it on',
    googlePlayName: 'Google Play',
} as const;
