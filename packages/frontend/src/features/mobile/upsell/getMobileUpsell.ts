import { useLocation, type Location } from 'react-router';

export type MobileUpsellChoice = 1 | 2 | 3 | 4 | 5 | 6;

type Place = Pick<Location, 'key' | 'pathname' | 'search'>;

const PARAM = 'mobileUpsell';
const HOME_PATH = /^\/projects\/[^/]+\/home\/?$/;
const REDIRECT_PATHS = ['/', '/projects'];

const toChoice = (value: string | null): MobileUpsellChoice | null => {
    switch (value) {
        case '1':
            return 1;
        case '2':
            return 2;
        case '3':
            return 3;
        case '4':
            return 4;
        case '5':
            return 5;
        case '6':
            return 6;
        default:
            return null;
    }
};

export const createMobileUpsellLifecycle = (initialSearch: string) => {
    let carried = toChoice(new URLSearchParams(initialSearch).get(PARAM));
    let phase: 'redirect' | 'home' | 'done' = 'redirect';
    let seenKey: string | null = null;

    const observe = ({ key, pathname }: Place) => {
        if (key === seenKey) return;
        seenKey = key;
        if (phase !== 'redirect') {
            phase = 'done';
        } else if (HOME_PATH.test(pathname)) {
            phase = 'home';
        } else if (!REDIRECT_PATHS.includes(pathname)) {
            phase = 'done';
        }
        if (phase === 'done') carried = null;
    };

    return {
        resolve: (place: Place): MobileUpsellChoice | null => {
            observe(place);
            const params = new URLSearchParams(place.search);
            if (!params.has(PARAM)) return carried;
            const choice = toChoice(params.get(PARAM));
            carried = phase === 'redirect' ? choice : null;
            return choice;
        },
    };
};

const pageLoad = createMobileUpsellLifecycle(window.location.search);

export const useMobileUpsell = (lifecycle = pageLoad) =>
    lifecycle.resolve(useLocation());
