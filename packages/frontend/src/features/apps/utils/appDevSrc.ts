import { useState } from 'react';

const APP_DEV_SRC_STORAGE_KEY = 'lightdash.appDevSrc';
const APP_DEV_SRC_PARAM = 'appDevSrc';
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const readAppDevSrc = (): URL | null => {
    const param = new URLSearchParams(window.location.search).get(
        APP_DEV_SRC_PARAM,
    );
    if (param === '') localStorage.removeItem(APP_DEV_SRC_STORAGE_KEY);
    else if (param) localStorage.setItem(APP_DEV_SRC_STORAGE_KEY, param);

    const raw = localStorage.getItem(APP_DEV_SRC_STORAGE_KEY);
    if (!raw) return null;
    try {
        const url = new URL(raw);
        return LOCAL_ORIGIN.test(url.origin) ? url : null;
    } catch {
        return null;
    }
};

/** Localhost-only override (`?appDevSrc=http://localhost:5173`, persisted;
 *  `?appDevSrc=` clears it) that iframes a locally served app instead. */
export const useAppDevSrc = (): URL | null => useState(readAppDevSrc)[0];

export const buildAppPreviewSrc = ({
    devSrc,
    previewOrigin,
    projectUuid,
    appUuid,
    version,
    token,
    refreshKey,
}: {
    devSrc: URL | null;
    previewOrigin: string;
    projectUuid: string;
    appUuid: string;
    version: number;
    token: string;
    refreshKey: number;
}): { src: string; origin: string } => {
    const hash = `#transport=postMessage&projectUuid=${projectUuid}`;
    if (devSrc) {
        const url = new URL(devSrc.href);
        url.searchParams.set('r', String(refreshKey));
        url.hash = '';
        return { src: `${url.toString()}${hash}`, origin: devSrc.origin };
    }
    return {
        src: `${previewOrigin}/api/apps/${appUuid}/versions/${version}/t/${token}/?r=${refreshKey}${hash}`,
        origin: previewOrigin,
    };
};
