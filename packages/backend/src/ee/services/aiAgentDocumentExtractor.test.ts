import { ParameterError } from '@lightdash/common';
import {
    extractAiAgentDocumentText,
    normalizeAiAgentDocumentMimeType,
} from './aiAgentDocumentExtractor';

describe('aiAgentDocumentExtractor', () => {
    describe('normalizeAiAgentDocumentMimeType', () => {
        it('uses the filename extension when browsers send octet-stream', () => {
            expect(
                normalizeAiAgentDocumentMimeType(
                    'application/octet-stream',
                    'rules.pdf',
                ),
            ).toEqual({
                kind: 'pdf',
                mimeType: 'application/pdf',
                storageExtension: 'txt',
            });
            expect(
                normalizeAiAgentDocumentMimeType(
                    'application/octet-stream',
                    'glossary.docx',
                ),
            ).toEqual({
                kind: 'docx',
                mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                storageExtension: 'txt',
            });
        });

        it('normalizes markdown and csv mime variants', () => {
            expect(
                normalizeAiAgentDocumentMimeType('text/x-markdown', 'glossary')
                    .mimeType,
            ).toBe('text/markdown');
            expect(
                normalizeAiAgentDocumentMimeType(
                    'application/vnd.ms-excel',
                    'terms',
                ).mimeType,
            ).toBe('text/csv');
        });

        it('rejects unsupported files', () => {
            expect(() =>
                normalizeAiAgentDocumentMimeType('image/png', 'image.png'),
            ).toThrow(ParameterError);
        });
    });

    describe('extractAiAgentDocumentText', () => {
        it('extracts plain text', async () => {
            await expect(
                extractAiAgentDocumentText({
                    buffer: Buffer.from('  revenue means net sales  '),
                    filename: 'glossary.txt',
                    mimeType: 'text/plain',
                }),
            ).resolves.toEqual({
                content: 'revenue means net sales',
                mimeType: 'text/plain',
                storageExtension: 'txt',
            });
        });

        it('extracts csv text', async () => {
            await expect(
                extractAiAgentDocumentText({
                    buffer: Buffer.from('\uFEFFmetric,definition\nGMV,total'),
                    filename: 'metrics.csv',
                    mimeType: 'text/csv',
                }),
            ).resolves.toEqual({
                content: 'metric,definition\nGMV,total',
                mimeType: 'text/csv',
                storageExtension: 'csv',
            });
        });

        it('rejects empty documents', async () => {
            await expect(
                extractAiAgentDocumentText({
                    buffer: Buffer.from('   '),
                    filename: 'empty.txt',
                    mimeType: 'text/plain',
                }),
            ).rejects.toThrow(ParameterError);
        });
    });
});
