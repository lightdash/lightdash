type SettingsSaveResult = {
    status: 'succeeded' | 'failed';
    error?: unknown;
};

type SettingsLike = {
    set: (key: string, value: unknown) => void;
    saveAsync: (callback: (result: SettingsSaveResult) => void) => void;
};

export const saveQueryState = (
    settings: SettingsLike,
    key: string,
    state: unknown,
) =>
    new Promise<void>((resolve, reject) => {
        settings.set(key, state);
        settings.saveAsync((result) => {
            if (result?.status === 'succeeded') {
                resolve();
                return;
            }

            reject(result?.error ?? new Error('Failed to save query state'));
        });
    });
