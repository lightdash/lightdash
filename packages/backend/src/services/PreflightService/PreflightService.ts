import { subject } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
    PreflightProbe,
    type RegisteredAccount,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import {
    PreflightAppliedMigration,
    PreflightModel,
} from '../../models/PreflightModel';
import { BaseService } from '../BaseService';

type PreflightServiceArguments = {
    lightdashConfig: LightdashConfig;
    preflightModel: PreflightModel;
};

const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const MAX_TABLES = 50;

export type PreflightProbeSnapshot = PreflightProbe & {
    appliedMigrations: PreflightAppliedMigration[];
};

/**
 * SPK-701 spike: read-only probe of the instance database's upgrade-relevant
 * state, for operators without direct Postgres access. Serves snapshots only —
 * joining them with per-migration facts (and everything EXPLAIN-based) stays
 * in the preflight consumer, so this endpoint never executes caller-supplied
 * SQL.
 */
export class PreflightService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly preflightModel: PreflightModel;

    constructor({
        lightdashConfig,
        preflightModel,
    }: PreflightServiceArguments) {
        super({ serviceName: 'PreflightService' });
        this.lightdashConfig = lightdashConfig;
        this.preflightModel = preflightModel;
    }

    private assertCanManageOrganization(account: RegisteredAccount): void {
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
    }

    async probe(
        account: RegisteredAccount,
        tables: string[],
    ): Promise<PreflightProbeSnapshot> {
        if (!this.lightdashConfig.preflight.probeEnabled) {
            throw new ForbiddenError(
                'Preflight probe is not enabled on this instance (set PREFLIGHT_PROBE_ENABLED=true)',
            );
        }
        if (this.lightdashConfig.allowMultiOrgs) {
            throw new ForbiddenError(
                'Preflight probe is only available on single-organization instances',
            );
        }
        this.assertCanManageOrganization(account);
        const uniqueTables = [...new Set(tables)];
        if (uniqueTables.length > MAX_TABLES) {
            throw new ParameterError(`Pass at most ${MAX_TABLES} tables`);
        }
        for (const table of uniqueTables) {
            if (!TABLE_NAME_PATTERN.test(table)) {
                throw new ParameterError(`Invalid table name: ${table}`);
            }
        }
        const [lock, appliedMigrations, tableStats, activity] =
            await Promise.all([
                this.preflightModel.getLockState(),
                this.preflightModel.getAppliedMigrations(),
                this.preflightModel.getTableStats(uniqueTables),
                this.preflightModel.getActivity({
                    includeQueryText: !this.lightdashConfig.allowMultiOrgs,
                }),
            ]);
        return {
            serverTime: new Date().toISOString(),
            lock,
            appliedMigrations,
            tableStats,
            activity,
        };
    }
}
