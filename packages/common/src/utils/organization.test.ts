import { describe, expect, it } from 'vitest';
import {
    DEFAULT_ORGANIZATION_NAME,
    getDefaultOrganizationName,
    inferOrganizationNameFromDomain,
} from './organization';

describe('inferOrganizationNameFromDomain', () => {
    it('title-cases the first label of the domain', () => {
        expect(inferOrganizationNameFromDomain('acme-analytics.co.uk')).toBe(
            'Acme Analytics',
        );
        expect(inferOrganizationNameFromDomain('lightdash.com')).toBe(
            'Lightdash',
        );
    });
});

describe('getDefaultOrganizationName', () => {
    it('guesses from a company email domain', () => {
        expect(getDefaultOrganizationName('demo@lightdash.com')).toBe(
            'Lightdash',
        );
    });

    it('falls back for personal email providers', () => {
        expect(getDefaultOrganizationName('someone@gmail.com')).toBe(
            DEFAULT_ORGANIZATION_NAME,
        );
    });

    it('falls back when there is no email', () => {
        expect(getDefaultOrganizationName(undefined)).toBe(
            DEFAULT_ORGANIZATION_NAME,
        );
    });

    it('falls back when the guess is not a valid organization name', () => {
        expect(getDefaultOrganizationName('a@---.com')).toBe(
            DEFAULT_ORGANIZATION_NAME,
        );
    });
});
