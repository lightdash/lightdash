import type { ServiceRepository } from '../services/ServiceRepository';
import { MobileSignInCapabilitiesController } from './mobileSignInCapabilitiesController';

it('returns static anonymous discovery without caching', async () => {
    const payload = {
        schemaVersion: 1 as const,
        capabilities: { mobile_sign_in_source_project: 1 as const },
    };
    const getCapabilities = vi.fn().mockResolvedValue(payload);
    const controller = new MobileSignInCapabilitiesController({
        getMobileSignInService: () => ({ getCapabilities }),
    } as unknown as ServiceRepository);
    expect(await controller.getCapabilities()).toEqual(payload);
    expect(controller.getHeaders()).toEqual({
        'Cache-Control': 'no-store',
    });
    expect(getCapabilities).toHaveBeenCalledWith();
    expect(Object.keys(payload)).toEqual(['schemaVersion', 'capabilities']);
});
