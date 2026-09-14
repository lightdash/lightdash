export type MobilePlatform = 'ios' | 'android' | 'desktop';

export const detectMobilePlatform = (
    userAgent: string,
    maxTouchPoints: number,
): MobilePlatform => {
    if (/android/i.test(userAgent)) return 'android';
    if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
    // iPadOS 13+ reports a desktop Safari user agent; touch points separate it
    // from a real Mac.
    if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
    return 'desktop';
};
