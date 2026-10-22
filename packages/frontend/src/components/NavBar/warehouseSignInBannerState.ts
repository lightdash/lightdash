import type { SharedSignInStatus } from '@lightdash/common';
import { useSyncExternalStore } from 'react';

type Banner = {
    projectUuid: string;
    userUuid: string;
    status: SharedSignInStatus;
    reconnect: () => void;
};
let banner: Banner | null = null;
const listeners = new Set<() => void>();
export const setWarehouseSignInBanner = (next: Banner | null) => {
    banner = next;
    listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
export const useWarehouseSignInBanner = () =>
    useSyncExternalStore(subscribe, () => banner);

let preflight: { projectUuid: string; userUuid: string } | null = null;
export const setWarehouseSignInPreflight = (
    projectUuid: string,
    userUuid: string,
) => {
    preflight = { projectUuid, userUuid };
    listeners.forEach((listener) => listener());
};
export const useWarehouseSignInPreflight = () =>
    useSyncExternalStore(subscribe, () => preflight);

export const clearWarehouseSignInPreflight = () => {
    preflight = null;
    listeners.forEach((listener) => listener());
};

let bannerVisible = false;
export const setWarehouseSignInBannerVisibility = (visible: boolean) => {
    if (bannerVisible === visible) return;
    bannerVisible = visible;
    listeners.forEach((listener) => listener());
};
export const useWarehouseSignInBannerVisibility = () =>
    useSyncExternalStore(subscribe, () => bannerVisible);
