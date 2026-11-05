import fetch, { Response } from 'node-fetch';
import sharp from 'sharp';
import Logger from '../../../logging/logger';
import { EnterpriseInstanceBrandService } from './InstanceBrandService';

vi.mock('node-fetch', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node-fetch')>()),
    default: vi.fn(),
}));

const warn = vi.fn();
const png = (width: number, height: number) =>
    sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
    })
        .png()
        .toBuffer();
const pngResponse = async (width: number, height: number) =>
    new Response(await png(width, height));
const dataUrl = (mimeType: string, body: Buffer | string) =>
    `data:${mimeType};base64,${Buffer.from(body).toString('base64')}`;

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'child').mockReturnValue({
        warn,
    } as unknown as typeof Logger);
});

describe('EnterpriseInstanceBrandService', () => {
    it('has no brand when nothing is configured', () => {
        const service = new EnterpriseInstanceBrandService({
            logo: undefined,
            name: ' ',
        });
        expect(service.getInstanceBrand()).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('returns the configured logo and name', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(await pngResponse(64, 64));
        const service = new EnterpriseInstanceBrandService({
            logo: ' https://cdn.example.com/logo.png ',
            name: 'Acme Analytics',
        });
        expect(service.getInstanceBrand()).toEqual({
            logoUrl: 'https://cdn.example.com/logo.png',
            name: 'Acme Analytics',
        });
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        expect(warn).not.toHaveBeenCalled();
    });

    it('serves a base64 data URL logo from the instance logo endpoint', async () => {
        const logo = await png(64, 64);
        const service = new EnterpriseInstanceBrandService({
            logo: dataUrl('image/png', logo),
            name: 'Acme Analytics',
        });
        expect(service.getInstanceBrand()).toEqual({
            logoUrl: expect.stringMatching(
                /^\/api\/v1\/org\/brand\/instance-logo\?v=[0-9a-f]{16}$/,
            ),
            name: 'Acme Analytics',
        });
        const logoFile = service.getInstanceLogoFile();
        expect(logoFile).toEqual({
            contentType: 'image/png',
            data: logo,
            version: expect.stringMatching(/^[0-9a-f]{16}$/),
        });
        expect(service.getInstanceBrand()?.logoUrl).toBe(
            `/api/v1/org/brand/instance-logo?v=${logoFile?.version}`,
        );
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(fetch).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('sanitizes an SVG data URL logo', () => {
        const service = new EnterpriseInstanceBrandService({
            logo: dataUrl(
                'image/svg+xml',
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
            ),
            name: undefined,
        });
        const logoFile = service.getInstanceLogoFile();
        expect(logoFile?.contentType).toBe('image/svg+xml');
        expect(logoFile?.data.toString('utf8')).not.toContain('<script');
        expect(logoFile?.data.toString('utf8')).toContain('<rect');
    });

    it.each([
        ['is not an image', dataUrl('image/png', 'not an image')],
        ['is not base64 encoded', 'data:image/svg+xml,<svg></svg>'],
        [
            'is too large',
            dataUrl('image/png', Buffer.alloc(512 * 1024 + 1, 0x89)),
        ],
    ])('ignores a data URL that %s', (_, logo) => {
        const service = new EnterpriseInstanceBrandService({
            logo,
            name: undefined,
        });
        expect(service.getInstanceBrand()).toBeNull();
        expect(service.getInstanceLogoFile()).toBeNull();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('Ignoring LIGHTDASH_INSTANCE_LOGO'),
        );
    });

    it('warns when a data URL logo is not square', async () => {
        const service = new EnterpriseInstanceBrandService({
            logo: dataUrl('image/png', await png(200, 50)),
            name: undefined,
        });
        expect(service.getInstanceLogoFile()).not.toBeNull();
        await vi.waitFor(() =>
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('should be a square image, got 200x50'),
            ),
        );
    });

    it('ignores a logo URL that is not https', () => {
        const service = new EnterpriseInstanceBrandService({
            logo: 'http://cdn.example.com/logo.png',
            name: 'Acme Analytics',
        });
        expect(service.getInstanceBrand()).toEqual({
            logoUrl: null,
            name: 'Acme Analytics',
        });
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
                'must be an https URL or a base64 data URL',
            ),
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('warns when the logo is not square', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(await pngResponse(200, 50));
        const service = new EnterpriseInstanceBrandService({
            logo: 'https://cdn.example.com/logo.png',
            name: undefined,
        });
        expect(service.getInstanceBrand()?.logoUrl).toBe(
            'https://cdn.example.com/logo.png',
        );
        await vi.waitFor(() =>
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('should be a square image, got 200x50'),
            ),
        );
    });

    it('warns when the logo cannot be loaded', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response('', { status: 404 }),
        );
        const service = new EnterpriseInstanceBrandService({
            logo: 'https://cdn.example.com/logo.png',
            name: undefined,
        });
        expect(service.getInstanceBrand()?.logoUrl).toBe(
            'https://cdn.example.com/logo.png',
        );
        await vi.waitFor(() =>
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('Could not load'),
            ),
        );
    });
});
