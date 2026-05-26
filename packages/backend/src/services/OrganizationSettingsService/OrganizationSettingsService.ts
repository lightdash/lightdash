import { subject } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationSettings,
    resolveEffectiveOrganizationSettings,
    UpdateOrganizationSettings,
    type RegisteredAccount,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import { BaseService } from '../BaseService';

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

    async getOrganizationSettings(
        account: RegisteredAccount,
    ): Promise<OrganizationSettings> {
        const organizationUuid = this.assertCanManageOrganization(account);
        const raw = await this.organizationSettingsModel.get(organizationUuid);
        return resolveEffectiveOrganizationSettings(
            raw,
            this.lightdashConfig.auth,
        );
    }

    async updateOrganizationSettings(
        account: RegisteredAccount,
        data: UpdateOrganizationSettings,
    ): Promise<OrganizationSettings> {
        const organizationUuid = this.assertCanManageOrganization(account);
        const raw = await this.organizationSettingsModel.update(
            organizationUuid,
            data,
        );
        return resolveEffectiveOrganizationSettings(
            raw,
            this.lightdashConfig.auth,
        );
    }
}
