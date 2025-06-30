import {
    createContentDispositionHeader,
    sanitizeGenericFileName,
} from './FileDownloadUtils';

describe('FileDownloadUtils', () => {
    describe('sanitizeGenericFileName', () => {
        // Test cases as data arrays for faster execution
        const preserveTestCases = [
            ['美しいチャート', '美しいチャート', 'Japanese characters'],
            ['Données français', 'Données français', 'French characters'],
            ['Sales Report 2024', 'Sales Report 2024', 'spaces'],
            ['MyReport', 'MyReport', 'mixed case'],
            [
                'Sales-Report_Final',
                'Sales-Report_Final',
                'hyphens and underscores',
            ],
            ['Data (2024)', 'Data (2024)', 'parentheses'],
            ['Report.v1', 'Report.v1', 'dots'],
            ['Report123', 'Report123', 'numbers'],
            ['Sales Report 📊 2024', 'Sales Report 📊 2024', 'emoji'],
        ];

        const unsafeCharTestCases = [
            ['Q1/Q2 Report', 'Q1_Q2 Report', 'forward slash'],
            ['Data\\Export', 'Data_Export', 'backslash'],
            ['Report: Summary', 'Report_ Summary', 'colon'],
            ['Data*Export', 'Data_Export', 'asterisk'],
            ['What?', 'What_', 'question mark'],
            ['The "Best" Report', 'The _Best_ Report', 'quotes'],
            ['Data<Export>', 'Data_Export_', 'angle brackets'],
            ['Data|Export', 'Data_Export', 'pipe'],
        ];

        const controlCharTestCases = [
            ['Report\x00Test', 'ReportTest', 'null character'],
            ['Report\tTest', 'ReportTest', 'tab character'],
            ['Report\nTest', 'ReportTest', 'newline'],
            ['Report\r\nTest', 'ReportTest', 'CRLF'],
            ['Report\x7FTest', 'ReportTest', 'DEL character'],
        ];

        const trimTestCases = [
            ['   Report', 'Report', 'leading spaces'],
            ['Report   ', 'Report', 'trailing spaces'],
            ['...Report', 'Report', 'leading dots'],
            ['Report...', 'Report', 'trailing dots'],
            [' . Report . ', 'Report', 'mixed leading/trailing'],
        ];

        it.each(preserveTestCases)(
            'should preserve %s (%s)',
            (input, expected) => {
                expect(sanitizeGenericFileName(input)).toBe(expected);
            },
        );

        it.each(unsafeCharTestCases)(
            'should replace %s (%s)',
            (input, expected) => {
                expect(sanitizeGenericFileName(input)).toBe(expected);
            },
        );

        it.each(controlCharTestCases)(
            'should remove %s (%s)',
            (input, expected) => {
                expect(sanitizeGenericFileName(input)).toBe(expected);
            },
        );

        it.each(trimTestCases)('should trim %s (%s)', (input, expected) => {
            expect(sanitizeGenericFileName(input)).toBe(expected);
        });

        it('handles multiple scenarios in batch', () => {
            // Group related assertions to reduce test overhead
            expect(
                sanitizeGenericFileName('Report: Q1/Q2 Analysis "Data"'),
            ).toBe('Report_ Q1_Q2 Analysis _Data_');
            expect(sanitizeGenericFileName('Data___Export')).toBe(
                'Data_Export',
            );
            expect(sanitizeGenericFileName('Data//\\\\Export')).toBe(
                'Data_Export',
            );
            expect(sanitizeGenericFileName('')).toBe('download');
            expect(sanitizeGenericFileName('//\\\\')).toBe('_');
            expect(sanitizeGenericFileName('***')).toBe('_');
            expect(sanitizeGenericFileName('   ...')).toBe('download');
        });

        it('handles real-world complex examples', () => {
            expect(sanitizeGenericFileName('美しいチャート: Q1/Q2 分析')).toBe(
                '美しいチャート_ Q1_Q2 分析',
            );
            expect(
                sanitizeGenericFileName('Données "françaises": Q1\\Q2'),
            ).toBe('Données _françaises_ Q1_Q2');
            expect(
                sanitizeGenericFileName('Johnson & Johnson: Q1 Report (Final)'),
            ).toBe('Johnson & Johnson_ Q1 Report (Final)');

            // Test very long filename
            const longName = 'a'.repeat(300);
            expect(sanitizeGenericFileName(longName)).toBe(longName);
        });
    });

    describe('createContentDispositionHeader', () => {
        const unicodeTestCases = [
            [
                '美しいチャート.csv',
                '.csv',
                '%E7%BE%8E%E3%81%97%E3%81%84%E3%83%81%E3%83%A3%E3%83%BC%E3%83%88.csv',
                'Japanese',
            ],
            [
                'Report 美しい.csv',
                'Report.csv',
                'Report%20%E7%BE%8E%E3%81%97%E3%81%84.csv',
                'mixed ASCII/Unicode',
            ],
            ['données.csv', 'donnes.csv', 'donn%C3%A9es.csv', 'French'],
            ['Sales 📊.csv', 'Sales.csv', 'Sales%20%F0%9F%93%8A.csv', 'emoji'],
        ];

        it('handles basic functionality', () => {
            expect(createContentDispositionHeader('report.csv')).toBe(
                'attachment; filename="report.csv"; filename*=UTF-8\'\'report.csv',
            );

            expect(createContentDispositionHeader('report: data.csv')).toBe(
                'attachment; filename="report_ data.csv"; filename*=UTF-8\'\'report_%20data.csv',
            );
        });

        it.each(unicodeTestCases)(
            'handles %s (%s)',
            (input, expectedFallback, expectedEncoded) => {
                const result = createContentDispositionHeader(input);
                expect(result).toContain(`filename="${expectedFallback}"`);
                expect(result).toContain(`filename*=UTF-8''${expectedEncoded}`);
            },
        );

        it('handles ASCII fallback scenarios', () => {
            const result1 =
                createContentDispositionHeader('美しいチャート Report.csv');
            expect(result1).toContain('filename="Report.csv"'); // Japanese removed, space normalized
            expect(result1).toContain(
                "filename*=UTF-8''%E7%BE%8E%E3%81%97%E3%81%84%E3%83%81%E3%83%A3%E3%83%BC%E3%83%88%20Report.csv",
            );

            const result2 =
                createContentDispositionHeader('美しいチャート.csv');
            expect(result2).toContain('filename=".csv"'); // Only extension remains
        });

        it('handles sanitization and encoding together', () => {
            const result1 = createContentDispositionHeader('美しい: Q1/Q2.csv');
            expect(result1).toContain('filename="_ Q1_Q2.csv"');
            expect(result1).toContain(
                "filename*=UTF-8''%E7%BE%8E%E3%81%97%E3%81%84_%20Q1_Q2.csv",
            );

            const result2 = createContentDispositionHeader(
                'Données "françaises": Q1\\Q2 📊.xlsx',
            );
            expect(result2).toContain(
                'filename="Donnes _franaises_ Q1_Q2.xlsx"',
            );
            expect(result2).toContain(
                "filename*=UTF-8''Donn%C3%A9es%20_fran%C3%A7aises_%20Q1_Q2%20%F0%9F%93%8A.xlsx",
            );
        });

        it('handles edge cases and RFC 5987 compliance', () => {
            // Edge cases
            expect(createContentDispositionHeader('')).toBe(
                'attachment; filename="download"; filename*=UTF-8\'\'download',
            );
            expect(createContentDispositionHeader('//\\\\')).toBe(
                'attachment; filename="_"; filename*=UTF-8\'\'_',
            );

            // RFC 5987 format compliance
            const result = createContentDispositionHeader('test.csv');
            expect(result).toMatch(
                /^attachment; filename="[^"]*"; filename\*=UTF-8''[^;]*$/,
            );

            // Proper encoding
            expect(createContentDispositionHeader('test file.csv')).toContain(
                "filename*=UTF-8''test%20file.csv",
            );
            expect(createContentDispositionHeader('test&file.csv')).toContain(
                "filename*=UTF-8''test%26file.csv",
            );
        });
    });

    describe('integration between functions', () => {
        it('should work together for complex filenames', () => {
            const originalFilename =
                '美しいチャート: "Q1/Q2" Analysis (Final).xlsx';

            // Test sanitization
            const sanitized = sanitizeGenericFileName(originalFilename);
            expect(sanitized).toBe(
                '美しいチャート_ _Q1_Q2_ Analysis (Final).xlsx',
            );

            // Test full header creation
            const header = createContentDispositionHeader(originalFilename);
            expect(header).toContain(
                'filename="_ _Q1_Q2_ Analysis (Final).xlsx"',
            ); // ASCII fallback
            expect(header).toContain(
                "filename*=UTF-8''%E7%BE%8E%E3%81%97%E3%81%84%E3%83%81%E3%83%A3%E3%83%BC%E3%83%88_%20_Q1_Q2_%20Analysis%20(Final).xlsx",
            );
        });

        it('should handle edge case where sanitization results in empty string', () => {
            const header = createContentDispositionHeader('///\\\\\\');
            expect(header).toBe(
                'attachment; filename="_"; filename*=UTF-8\'\'_',
            );
        });
    });
});
