import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    OrganizationSettings,
    ParameterError,
    POSTGRES_INTEGER_MAX,
    resolveEffectiveOrganizationSettings,
    UpdateOrganizationSettings,
    type RegisteredAccount,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import { BaseService } from '../BaseService';
import { getOrganizationSettingsInstanceDefaults } from './getInstanceDefaults';

type OrganizationSettingsServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationSettingsModel: OrganizationSettingsModel;
    featureFlagModel: FeatureFlagModel;
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

    private readonly featureFlagModel: FeatureFlagModel;

    constructor({
        lightdashConfig,
        organizationSettingsModel,
        featureFlagModel,
    }: OrganizationSettingsServiceArguments) {
        super({ serviceName: 'OrganizationSettingsService' });
        this.lightdashConfig = lightdashConfig;
        this.organizationSettingsModel = organizationSettingsModel;
        this.featureFlagModel = featureFlagModel;
    }

    /**
     * The export limits (query rows / CSV cells) are a Pro capability gated by
     * the `pro-limits` flag. The panel is hidden without it, but the update API
     * must enforce it too so the gate can't be bypassed via a direct call.
     */
    private async assertCanManageLimits(
        account: RegisteredAccount,
        data: UpdateOrganizationSettings,
    ): Promise<void> {
        const touchesLimits =
            data.queryLimit !== undefined || data.csvCellsLimit !== undefined;
        if (!touchesLimits) {
            return;
        }
        const flag = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: account.organization?.organizationUuid,
                organizationName: account.organization?.name,
            },
            featureFlagId: FeatureFlags.ProLimits,
        });
        if (!flag.enabled) {
            throw new ForbiddenError(
                'Organization limits are not enabled for this organization.',
            );
        }
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
     * Validates the numeric overrides before they're persisted: each must be a
     * positive integer within the Postgres column ceiling, and the two export
     * limits additionally cannot exceed their instance env ceilings. A `null`
     * clears an override (back to inheriting the env default).
     */
    private assertValidPatch(data: UpdateOrganizationSettings): void {
        const positiveIntegerFields: Array<keyof UpdateOrganizationSettings> = [
            'scheduledDeliveryExpirationSeconds',
            'scheduledDeliveryExpirationSecondsEmail',
            'scheduledDeliveryExpirationSecondsSlack',
            'scheduledDeliveryExpirationSecondsMsTeams',
            'scheduledDeliveryExpirationSecondsGoogleChat',
            'queryLimit',
            'csvCellsLimit',
        ];
        // Bounded by the integer column ceiling — above it the DB insert throws
        // an out-of-range error (a 500) instead of a clean validation failure.
        const isInvalid = (value: number | boolean | null | undefined) =>
            value !== undefined &&
            value !== null &&
            (typeof value !== 'number' ||
                !Number.isInteger(value) ||
                value <= 0 ||
                value > POSTGRES_INTEGER_MAX);
        if (positiveIntegerFields.some((field) => isInvalid(data[field]))) {
            throw new ParameterError(
                `Scheduled delivery expiry and export limits must be whole numbers between 1 and ${POSTGRES_INTEGER_MAX}.`,
            );
        }
        // The CSV cells limit is capped at LIGHTDASH_CSV_MAX_LIMIT — but
        // never below the instance's own default, so an instance whose env
        // default already exceeds the cap is never forced to lower its limit.
        const csvCellsCap = Math.max(
            this.lightdashConfig.query.csvMaxLimit,
            this.lightdashConfig.query.csvCellsLimit,
        );
        if (
            data.csvCellsLimit !== undefined &&
            data.csvCellsLimit !== null &&
            data.csvCellsLimit > csvCellsCap
        ) {
            throw new ParameterError(
                `CSV cells limit cannot exceed ${csvCellsCap}.`,
            );
        }
        // The query row limit can only be restricted below the instance ceiling
        // (LIGHTDASH_QUERY_MAX_LIMIT).
        const queryLimitCap = this.lightdashConfig.query.maxLimit;
        if (
            data.queryLimit !== undefined &&
            data.queryLimit !== null &&
            data.queryLimit > queryLimitCap
        ) {
            throw new ParameterError(
                `Maximum query rows cannot exceed ${queryLimitCap}.`,
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
        await this.assertCanManageLimits(account, data);
        this.assertValidPatch(data);
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
