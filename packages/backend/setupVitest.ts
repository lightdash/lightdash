import { vi } from 'vitest';

vi.mock('./src/config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('./src/config/lightdashConfig.mock');

    return {
        lightdashConfig: lightdashConfigMock,
    };
});
