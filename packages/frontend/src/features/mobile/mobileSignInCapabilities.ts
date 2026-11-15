import type { MobileSignInCapabilities } from '@lightdash/common';
import { BASE_API_URL } from '../../api';

const DISCOVERY_TIMEOUT_MS = 500;

export const supportsMobileSignInSourceProject = async (): Promise<boolean> => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        const discovery = (async () => {
            const response = await fetch(
                `${BASE_API_URL}api/v1/mobile/sign-in-capabilities`,
                {
                    cache: 'no-store',
                    credentials: 'omit',
                    signal: controller.signal,
                },
            );
            if (!response.ok) return false;
            const result: Partial<MobileSignInCapabilities> | null =
                await response.json();
            return (
                result?.schemaVersion === 1 &&
                result.capabilities?.mobile_sign_in_source_project === 1
            );
        })();
        return await Promise.race([
            discovery,
            new Promise<boolean>((resolve) => {
                timeout = setTimeout(
                    () => resolve(false),
                    DISCOVERY_TIMEOUT_MS,
                );
            }),
        ]);
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
        controller.abort();
    }
};
