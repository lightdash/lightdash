import { describe, expect, it } from 'vitest';
import { getDataAppsSettingsLanding } from './dataAppsSettingsLanding';

describe('getDataAppsSettingsLanding', () => {
    it('lands an organization manager on General', () => {
        expect(
            getDataAppsSettingsLanding({
                canManageOrganization: true,
                canManageThemes: true,
            }),
        ).toBe('/generalSettings/dataApps/general');
        expect(
            getDataAppsSettingsLanding({
                canManageOrganization: true,
                canManageThemes: false,
            }),
        ).toBe('/generalSettings/dataApps/general');
    });

    it('lands a user who can only manage themes on Themes', () => {
        expect(
            getDataAppsSettingsLanding({
                canManageOrganization: false,
                canManageThemes: true,
            }),
        ).toBe('/generalSettings/dataApps/themes');
    });

    it('has no landing page for a user who can reach none', () => {
        expect(
            getDataAppsSettingsLanding({
                canManageOrganization: false,
                canManageThemes: false,
            }),
        ).toBeNull();
    });
});
