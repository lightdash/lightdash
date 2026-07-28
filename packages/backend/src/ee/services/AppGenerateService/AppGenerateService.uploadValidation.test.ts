import { ParameterError } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { AppGenerateService } from './AppGenerateService';

// Private statics — accessed via index so the upload classification contract
// stays covered without widening the service's public surface.
// eslint-disable-next-line @typescript-eslint/dot-notation
const validate = AppGenerateService['validateUploadContent'];
// eslint-disable-next-line @typescript-eslint/dot-notation
const sanitize = AppGenerateService['sanitizeFilename'];
// eslint-disable-next-line @typescript-eslint/dot-notation
const assignNames = AppGenerateService['assignSandboxFilenames'];

const PNG_BODY = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
]);

describe('validateUploadContent', () => {
    it('accepts a PNG whose bytes match the declared type', () => {
        expect(validate(PNG_BODY, 'image/png')).toEqual({
            category: 'image',
            mimeType: 'image/png',
        });
    });

    it('rejects an image whose bytes do not match the declared type', () => {
        expect(() => validate(Buffer.alloc(32), 'image/png')).toThrow(
            ParameterError,
        );
    });

    it('classifies a PDF by signature even when declared as octet-stream', () => {
        expect(
            validate(Buffer.from('%PDF-1.7 …'), 'application/octet-stream'),
        ).toEqual({ category: 'pdf', mimeType: 'application/pdf' });
    });

    it('rejects a declared PDF without the %PDF signature', () => {
        expect(() =>
            validate(Buffer.from('not a pdf'), 'application/pdf'),
        ).toThrow(ParameterError);
    });

    it('normalizes unknown declared types to text/plain when content sniffs as text', () => {
        const twb = Buffer.from('<?xml version="1.0"?><workbook/>');
        expect(validate(twb, 'application/octet-stream')).toEqual({
            category: 'text',
            mimeType: 'text/plain',
        });
    });

    it('keeps a recognized text MIME type as-is', () => {
        expect(validate(Buffer.from('{"a":1}'), 'application/json')).toEqual({
            category: 'text',
            mimeType: 'application/json',
        });
    });

    it('accepts multi-byte UTF-8 cut off at the sniff boundary', () => {
        const body = Buffer.concat([
            Buffer.alloc(8191, 0x61),
            Buffer.from('é'), // 2 bytes — split by the 8192-byte sample
        ]);
        expect(validate(body, 'text/plain').category).toBe('text');
    });

    it('rejects binary content that is neither image, PDF, nor text', () => {
        const exe = Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x02, 0x03]);
        expect(() => validate(exe, 'application/octet-stream')).toThrow(
            /Unsupported file type/,
        );
    });
});

describe('sanitizeFilename', () => {
    it('strips directory components and unsafe characters', () => {
        expect(sanitize('../../etc/passwd')).toBe('passwd');
        expect(sanitize('sales\\Q1 "report".twb')).toBe('Q1 _report_.twb');
    });

    it('returns null when nothing usable remains', () => {
        expect(sanitize('...')).toBe(null);
        expect(sanitize('///')).toBe(null);
    });

    it('bounds length while preserving the extension', () => {
        const out = sanitize(`${'a'.repeat(200)}.twb`);
        expect(out).toHaveLength(100);
        expect(out?.endsWith('.twb')).toBe(true);
    });
});

describe('assignSandboxFilenames', () => {
    const staged = (fileId: string, filename: string, isImage = false) => ({
        fileId,
        mimeType: isImage ? 'image/png' : 'text/plain',
        filename,
        isImage,
        isScreenshot: false,
    });

    it('dedupes colliding filenames with a numeric suffix', () => {
        const named = assignNames([
            staged('aaaa', 'data.json'),
            staged('bbbb', 'data.json'),
            staged('cccc', 'data.json'),
        ]);
        expect(named.map((f) => f.sandboxFilename)).toEqual([
            'data.json',
            'data-2.json',
            'data-3.json',
        ]);
    });

    it('keeps the uuid-based convention for images', () => {
        const named = assignNames([staged('img-1', 'logo.png', true)]);
        expect(named[0].sandboxFilename).toBe('img-1.png');
    });
});
