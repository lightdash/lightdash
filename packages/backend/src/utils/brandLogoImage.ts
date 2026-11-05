import {
    ParameterError,
    type OrganizationBrandLogoUpload,
} from '@lightdash/common';
import { sanitizeSvg } from './sanitizeSvg';

const BRAND_LOGO_CONTENT_TYPES: Record<
    OrganizationBrandLogoUpload['format'],
    string
> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
};

const startsWithBytes = (body: Buffer, bytes: number[]) =>
    bytes.every((byte, index) => body[index] === byte);

const detectBrandLogoFormat = (
    body: Buffer,
): OrganizationBrandLogoUpload['format'] | null => {
    if (startsWithBytes(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        return 'png';
    if (startsWithBytes(body, [0xff, 0xd8, 0xff])) return 'jpeg';
    if (
        body
            .subarray(0, 6)
            .toString('ascii')
            .match(/^GIF8[79]a$/)
    )
        return 'gif';
    if (
        body.subarray(0, 4).toString('ascii') === 'RIFF' &&
        body.subarray(8, 12).toString('ascii') === 'WEBP'
    )
        return 'webp';
    const head = body
        .subarray(0, 1024)
        .toString('utf8')
        .replace(/^\uFEFF/, '');
    if (
        /^\s*<(\?xml|svg|!--|!doctype)/i.test(head) &&
        /<svg[\s>]/i.test(body.toString('utf8'))
    )
        return 'svg';
    return null;
};

export const prepareBrandLogoImage = (
    body: Buffer,
): {
    format: OrganizationBrandLogoUpload['format'];
    contentType: string;
    data: Buffer;
} => {
    const format = detectBrandLogoFormat(body);
    if (!format) {
        throw new ParameterError(
            'Logo must be a PNG, JPEG, WebP, GIF or SVG image',
        );
    }
    const data =
        format === 'svg'
            ? Buffer.from(sanitizeSvg(body.toString('utf8')), 'utf8')
            : body;
    if (data.length === 0) {
        throw new ParameterError('SVG contains no safe content');
    }
    return { format, contentType: BRAND_LOGO_CONTENT_TYPES[format], data };
};
