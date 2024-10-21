/* eslint-disable no-useless-escape */
import { getEmailDomain } from './email';

describe('getEmailDomain', () => {
    it('should return the correct domain for a valid email', () => {
        expect(getEmailDomain('user@example.com')).toBe('example.com');
        expect(getEmailDomain('another.user@sub.domain.co.uk')).toBe(
            'sub.domain.co.uk',
        );
    });

    it('should convert the domain to lowercase', () => {
        expect(getEmailDomain('user@EXAMPLE.COM')).toBe('example.com');
        expect(getEmailDomain('user@Example.Com')).toBe('example.com');
    });

    it('should throw an error for emails containing whitespace', () => {
        expect(() => getEmailDomain('user @example.com')).toThrow(
            'Invalid email, contains whitespace',
        );
        expect(() => getEmailDomain(' user@example.com')).toThrow(
            'Invalid email, contains whitespace',
        );
        expect(() => getEmailDomain('user@example.com ')).toThrow(
            'Invalid email, contains whitespace',
        );
    });

    it('should throw an error for emails without exactly one @ symbol', () => {
        expect(() => getEmailDomain('userexample.com')).toThrow(
            'Invalid email',
        );
        expect(() => getEmailDomain('user@example@com')).toThrow(
            'Invalid email',
        );
    });

    it('should handle email addresses with special characters in the local part', () => {
        expect(getEmailDomain('user+tag@example.com')).toBe('example.com');
        expect(getEmailDomain('user.name@example.com')).toBe('example.com');
        expect(getEmailDomain('user-name@example.com')).toBe('example.com');
    });

    it('should correctly handle email addresses with multiple @ symbols', () => {
        expect(() => getEmailDomain('user@domain.com@example.com')).toThrow(
            'Invalid email',
        );
        expect(() => getEmailDomain('"user@domain.com"@example.com')).toThrow(
            'Invalid email',
        );
        expect(() => getEmailDomain('"@domain.com@"@example.com')).toThrow(
            'Invalid email',
        );
    });

    it('should not be fooled by attempts to manipulate the domain extraction', () => {
        expect(() =>
            getEmailDomain('user@malicious.com@legitimate.org'),
        ).toThrow('Invalid email');
        expect(() =>
            getEmailDomain('"@organization.com@"@attacker.com'),
        ).toThrow('Invalid email');
        expect(() =>
            getEmailDomain('user+@company.com@personal.email'),
        ).toThrow('Invalid email');
    });

    it('should throw an error for invalid email constructions', () => {
        expect(() => getEmailDomain('user@@domain.com')).toThrow(
            'Invalid email',
        );
        expect(() => getEmailDomain('@domain.com@')).toThrow('Invalid email');
        expect(() => getEmailDomain('user@')).toThrow('Invalid email');
    });

    it('should handle complex but valid email addresses', () => {
        // Unusual email without extra @
        expect(
            getEmailDomain(
                '"very.(),:;<>[]".VERY."very\\"very".unusual"@strange.example.com',
            ),
        ).toBe('strange.example.com');
        // Unusual email with extra @
        expect(() =>
            getEmailDomain(
                '"very.(),:;<>[]".VERY."very@\\"very".unusual"@strange.example.com',
            ),
        ).toThrow('Invalid email');
        expect(getEmailDomain("!#$%&'*+-/=?^_`{}|~@example.org")).toBe(
            'example.org',
        );
    });
});
