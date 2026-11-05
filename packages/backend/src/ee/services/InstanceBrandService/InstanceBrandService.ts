import {
    getErrorMessage,
    isSquareBrandLogo,
    MAX_ORGANIZATION_BRAND_LOGO_BYTES,
    type InstanceBrand,
} from '@lightdash/common';
import fetch from 'node-fetch';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
    getInstanceLogoUrl,
    InstanceBrandService,
    type InstanceLogoFile,
} from '../../../services/InstanceBrandService/InstanceBrandService';
import { prepareBrandLogoImage } from '../../../utils/brandLogoImage';

const LOGO_CHECK_TIMEOUT_MS = 10_000;
const BASE64_DATA_URL_PATTERN = /^data:[^,;]*(?:;[^,;]+)*;base64,(.*)$/is;

const isHttpsUrl = (value: string): boolean => {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
};

export class EnterpriseInstanceBrandService extends InstanceBrandService {
    private readonly instanceBrand: InstanceBrand | null;

    private readonly logoFile: InstanceLogoFile | null;

    constructor({
        logo,
        name,
    }: {
        logo: string | undefined;
        name: string | undefined;
    }) {
        super();
        const value = logo?.trim() || null;
        this.logoFile = value?.startsWith('data:')
            ? this.parseDataUrl(value)
            : null;
        let resolvedLogoUrl: string | null = null;
        if (this.logoFile) {
            resolvedLogoUrl = getInstanceLogoUrl(this.logoFile.version);
            void this.warnIfLogoIsNotSquare(
                Promise.resolve(this.logoFile.data),
            );
        } else if (value && !value.startsWith('data:')) {
            if (isHttpsUrl(value)) {
                resolvedLogoUrl = value;
                void this.warnIfLogoIsNotSquare(
                    EnterpriseInstanceBrandService.fetchLogo(value),
                );
            } else {
                this.logger.warn(
                    'Ignoring LIGHTDASH_INSTANCE_LOGO: it must be an https URL or a base64 data URL',
                );
            }
        }
        const trimmedName = name?.trim() || null;
        this.instanceBrand =
            resolvedLogoUrl || trimmedName
                ? { logoUrl: resolvedLogoUrl, name: trimmedName }
                : null;
    }

    override getInstanceBrand(): InstanceBrand | null {
        return this.instanceBrand;
    }

    override getInstanceLogoFile(): InstanceLogoFile | null {
        return this.logoFile;
    }

    private parseDataUrl(value: string): InstanceLogoFile | null {
        const base64 = value.match(BASE64_DATA_URL_PATTERN)?.[1];
        const body = base64 ? Buffer.from(base64, 'base64') : null;
        if (!body || body.length === 0) {
            this.logger.warn(
                'Ignoring LIGHTDASH_INSTANCE_LOGO: data URLs must be base64 encoded',
            );
            return null;
        }
        if (body.length > MAX_ORGANIZATION_BRAND_LOGO_BYTES) {
            this.logger.warn(
                `Ignoring LIGHTDASH_INSTANCE_LOGO: the logo must be ${MAX_ORGANIZATION_BRAND_LOGO_BYTES / 1024} KB or smaller`,
            );
            return null;
        }
        try {
            const { contentType, data } = prepareBrandLogoImage(body);
            const version = createHash('sha256')
                .update(data)
                .digest('hex')
                .slice(0, 16);
            return { contentType, data, version };
        } catch (error) {
            this.logger.warn(
                `Ignoring LIGHTDASH_INSTANCE_LOGO: ${getErrorMessage(error)}`,
            );
            return null;
        }
    }

    private static async fetchLogo(logoUrl: string): Promise<Buffer> {
        const response = await fetch(logoUrl, {
            timeout: LOGO_CHECK_TIMEOUT_MS,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.buffer();
    }

    private async warnIfLogoIsNotSquare(logo: Promise<Buffer>): Promise<void> {
        try {
            const { width, height } = await sharp(await logo).metadata();
            if (!width || !height || !isSquareBrandLogo(width, height)) {
                this.logger.warn(
                    `LIGHTDASH_INSTANCE_LOGO should be a square image, got ${width}x${height}`,
                );
            }
        } catch (error) {
            this.logger.warn(
                `Could not load LIGHTDASH_INSTANCE_LOGO: ${getErrorMessage(error)}`,
            );
        }
    }
}
