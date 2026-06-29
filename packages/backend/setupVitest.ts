import { vi } from 'vitest';

// Safety net: stub global fetch so unit tests never hit the real network (tests override per-case).
vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 200 })),
);

vi.mock('./src/config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('./src/config/lightdashConfig.mock');

    return {
        lightdashConfig: lightdashConfigMock,
    };
});
