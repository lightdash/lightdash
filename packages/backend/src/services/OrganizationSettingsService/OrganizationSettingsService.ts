import { subject } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationSettings,
    ParameterError,
    resolveEffectiveOrganizationSettings,
    UpdateOrganizationSettings,
    type RegisteredAccount,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import { BaseService } from '../BaseService';
import { getOrganizationSettingsInstanceDefaults } from './getInstanceDefaults';

type OrganizationSettingsServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationSettingsModel: OrganizationSettingsModel;
};

/**
 * Generic per-organization settings (account-linking toggles today, more to
 * come). Stored in `organization_settings`, gated by `manage Organization`.
 * Reads/writes raw overrides but always returns the EFFECTIVE value (override
 * resolved against the instance default via the shared resolver), so callers —
 * including the frontend — never re-implement the fallback.
 */
export class OrganizationSettingsService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationSettingsModel: OrganizationSettingsModel;

    constructor({
        lightdashConfig,
        organizationSettingsModel,
    }: OrganizationSettingsServiceArguments) {
        super({ serviceName: 'OrganizationSettingsService' });
        this.lightdashConfig = lightdashConfig;
        this.organizationSettingsModel = organizationSettingsModel;
    }

    private assertCanManageOrganization(account: RegisteredAccount): string {
        const organizationUuid = account.organization?.organizationUuid;
        if (!organizationUuid) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return organizationUuid;
    }

    /**
     * Sanity-checks the scheduled-delivery expiry overrides (base + per-channel)
     * before they're persisted. A `null` clears an override (back to inheriting
     * the base / env). We don't cap the value — it feeds the existing expiry
     * mechanism as-is (links over 7 days transparently use persistent download
     * URLs) — we only reject nonsense that would store an already-expired link.
     */
    private static assertValidPatch(data: UpdateOrganizationSettings): void {
        const expiryFields: Array<keyof UpdateOrganizationSettings> = [
            'scheduledDeliveryExpirationSeconds',
            'scheduledDeliveryExpirationSecondsEmail',
            'scheduledDeliveryExpirationSecondsSlack',
            'scheduledDeliveryExpirationSecondsMsTeams',
        ];
        const isInvalid = (value: number | boolean | null | undefined) =>
            value !== undefined &&
            value !== null &&
            (typeof value !== 'number' ||
                !Number.isInteger(value) ||
                value <= 0);
        if (expiryFields.some((field) => isInvalid(data[field]))) {
            throw new ParameterError(
                'Scheduled delivery link expiry must be a positive whole number of seconds.',
            );
        }
    }

    async getOrganizationSettings(
        account: RegisteredAccount,
    ): Promise<OrganizationSettings> {
        const organizationUuid = this.assertCanManageOrganization(account);
        const raw = await this.organizationSettingsModel.get(organizationUuid);
        return resolveEffectiveOrganizationSettings(
            raw,
            getOrganizationSettingsInstanceDefaults(this.lightdashConfig),
        );
    }

    async updateOrganizationSettings(
        account: RegisteredAccount,
        data: UpdateOrganizationSettings,
    ): Promise<OrganizationSettings> {
        const organizationUuid = this.assertCanManageOrganization(account);
        OrganizationSettingsService.assertValidPatch(data);
        const raw = await this.organizationSettingsModel.update(
            organizationUuid,
            data,
        );
        return resolveEffectiveOrganizationSettings(
            raw,
            getOrganizationSettingsInstanceDefaults(this.lightdashConfig),
        );
    }
}
