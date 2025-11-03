import { evaluateConditionalFormatExpression } from './conditionalFormatExpressions';

describe('evaluateConditionalFormatExpression', () => {
    describe('simple parameter substitution', () => {
        it('should replace parameter with value using ld.parameters prefix', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.currency}0,0.00',
                { currency: '$' },
            );
            expect(result).toBe('$0,0.00');
        });

        it('should replace parameter with value using lightdash.parameters prefix', () => {
            const result = evaluateConditionalFormatExpression(
                '${lightdash.parameters.currency}0,0.00',
                { currency: '€' },
            );
            expect(result).toBe('€0,0.00');
        });

        it('should replace parameter without prefix', () => {
            const result = evaluateConditionalFormatExpression(
                '${currency}0,0.00',
                { currency: '£' },
            );
            expect(result).toBe('£0,0.00');
        });

        it('should leave placeholder unchanged if parameter not found', () => {
            const result = evaluateConditionalFormatExpression(
                '${missing}0,0.00',
                {},
            );
            expect(result).toBe('${missing}0,0.00');
        });
    });

    describe('ternary expressions with simple values', () => {
        it('should evaluate ternary with == operator when condition is true', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.currency=="USD"?"$":"€"}0,0.00',
                { currency: 'USD' },
            );
            expect(result).toBe('$0,0.00');
        });

        it('should evaluate ternary with == operator when condition is false', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.currency=="USD"?"$":"€"}0,0.00',
                { currency: 'EUR' },
            );
            expect(result).toBe('€0,0.00');
        });

        it('should evaluate ternary with != operator when condition is true', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.currency!="USD"?"€":"$"}0,0.00',
                { currency: 'EUR' },
            );
            expect(result).toBe('€0,0.00');
        });

        it('should evaluate ternary with != operator when condition is false', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.currency!="USD"?"€":"$"}0,0.00',
                { currency: 'USD' },
            );
            expect(result).toBe('$0,0.00');
        });
    });

    describe('ternary expressions with colons in quoted values', () => {
        it('should handle colon in true value (double quotes)', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.time=="12:00"?"12:00":"13:00"}',
                { time: '12:00' },
            );
            expect(result).toBe('12:00');
        });

        it('should handle colon in false value (double quotes)', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.time=="12:00"?"12:00":"13:00"}',
                { time: '14:00' },
            );
            expect(result).toBe('13:00');
        });

        it('should handle colon in both values (double quotes)', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.time=="morning"?"09:00":"17:00"}',
                { time: 'morning' },
            );
            expect(result).toBe('09:00');
        });

        it('should handle colon in true value (single quotes)', () => {
            const result = evaluateConditionalFormatExpression(
                "${ld.parameters.time=='12:00'?'12:00':'13:00'}",
                { time: '12:00' },
            );
            expect(result).toBe('12:00');
        });

        it('should handle colon in false value (single quotes)', () => {
            const result = evaluateConditionalFormatExpression(
                "${ld.parameters.time=='12:00'?'12:00':'13:00'}",
                { time: '14:00' },
            );
            expect(result).toBe('13:00');
        });

        it('should handle multiple colons in values', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.format=="long"?"HH:MM:SS":"HH:MM"}',
                { format: 'long' },
            );
            expect(result).toBe('HH:MM:SS');
        });

        it('should handle colons in condition and values', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.time=="12:00"?"Time is 12:00":"Time is 13:00"}',
                { time: '12:00' },
            );
            expect(result).toBe('Time is 12:00');
        });
    });

    describe('ternary expressions with question marks in quoted values', () => {
        it('should handle question mark in true value', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.status=="unknown"?"Unknown?":"Known"}',
                { status: 'unknown' },
            );
            expect(result).toBe('Unknown?');
        });

        it('should handle question mark in false value', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.status=="unknown"?"Known":"Unknown?"}',
                { status: 'known' },
            );
            expect(result).toBe('Unknown?');
        });

        it('should handle question mark in condition value', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.question=="Why?"?"Yes":"No"}',
                { question: 'Why?' },
            );
            expect(result).toBe('Yes');
        });

        it('should handle multiple question marks in values', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.type=="quiz"?"Question?? Answer??":"Statement"}',
                { type: 'quiz' },
            );
            expect(result).toBe('Question?? Answer??');
        });
    });

    describe('ternary expressions with equals signs in quoted values', () => {
        it('should handle single equals in true value', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.format=="equation"?"x=5":"y=10"}',
                { format: 'equation' },
            );
            expect(result).toBe('x=5');
        });

        it('should handle single equals in false value', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.format=="equation"?"x=5":"y=10"}',
                { format: 'other' },
            );
            expect(result).toBe('y=10');
        });

        it('should handle multiple equals in values', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.type=="formula"?"a=b=c":"x=y=z"}',
                { type: 'formula' },
            );
            expect(result).toBe('a=b=c');
        });

        it('should handle equals in condition value', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.equation=="x=5"?"Match":"No match"}',
                { equation: 'x=5' },
            );
            expect(result).toBe('Match');
        });
    });

    describe('complex edge cases', () => {
        it('should handle both colons and question marks in values', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.type=="time"?"Time: 12:00?":"Date: 2024?"}',
                { type: 'time' },
            );
            expect(result).toBe('Time: 12:00?');
        });

        // Note: Escaped quotes are supported, but curly braces inside quoted values
        // will interfere with the ${} placeholder regex. This is a known limitation.
        it('should handle escaped quotes in values (without curly braces)', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.type=="quoted"?"\\"Hello\\"":"\\"World\\""}',
                { type: 'quoted' },
            );
            expect(result).toBe('"Hello"');
        });

        it('should handle mixed quote types', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.type=="a"?"It\'s true":"It\'s false"}',
                { type: 'a' },
            );
            expect(result).toBe("It's true");
        });

        it('should handle empty string values', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.empty==""?"Empty":"Not empty"}',
                { empty: '' },
            );
            expect(result).toBe('Empty');
        });

        it('should handle whitespace in condition and values', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.status == "active" ? "Active: Yes" : "Active: No"}',
                { status: 'active' },
            );
            expect(result).toBe('Active: Yes');
        });

        it('should handle multiple ternary expressions in one format string', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.prefix=="$"?"$":"€"}${ld.parameters.suffix=="k"?"K":"M"}',
                { prefix: '$', suffix: 'k' },
            );
            expect(result).toBe('$K');
        });
    });

    describe('invalid expressions', () => {
        it('should return expression as-is if ternary is incomplete (missing colon)', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.x=="a"?"yes"}',
                { x: 'a' },
            );
            expect(result).toBe('${ld.parameters.x=="a"?"yes"}');
        });

        it('should return expression as-is if ternary is incomplete (missing question mark)', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.x=="a":"yes"}',
                { x: 'a' },
            );
            expect(result).toBe('${ld.parameters.x=="a":"yes"}');
        });

        it('should not evaluate single = as comparison operator (use == instead)', () => {
            // Single = is not supported, only == and != are valid comparison operators
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.x="a"?"yes":"no"}',
                { x: 'a' },
            );
            // Without == or !=, it tries to look up 'x="a"' as a parameter name (which doesn't exist)
            // so the condition evaluates to falsy, returning the false branch
            expect(result).toBe('no');
        });
    });

    describe('parameter comparison', () => {
        it('should compare two parameters', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.a==ld.parameters.b?"Same":"Different"}',
                { a: 'value', b: 'value' },
            );
            expect(result).toBe('Same');
        });

        it('should compare parameter to another parameter with different values', () => {
            const result = evaluateConditionalFormatExpression(
                '${ld.parameters.a==ld.parameters.b?"Same":"Different"}',
                { a: 'value1', b: 'value2' },
            );
            expect(result).toBe('Different');
        });
    });
});
