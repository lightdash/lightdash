import { subject } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
    PreflightExplain,
    PreflightProbe,
    type RegisteredAccount,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { PreflightModel } from '../../models/PreflightModel';
import { BaseService } from '../BaseService';

type PreflightServiceArguments = {
    lightdashConfig: LightdashConfig;
    preflightModel: PreflightModel;
};

const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const MAX_TABLES = 50;
const MAX_SQL_LENGTH = 8000;
const EXPLAIN_TIMEOUT_SECONDS = 15;
const READ_ONLY_SELECT_PATTERN = /^(SELECT|WITH)\s/i;

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

    private assertProbeAllowed(account: RegisteredAccount): void {
        if (!this.lightdashConfig.preflight.probeEnabled) {
            throw new ForbiddenError(
                'Preflight probe is not enabled on this instance (set PREFLIGHT_PROBE_ENABLED=true)',
            );
        }
        // Re-checked here rather than inherited: EXPLAIN exposes plan shapes for
        // the whole database, and this must not become reachable if the probe's
        // own multi-org guard is ever relaxed.
        if (this.lightdashConfig.allowMultiOrgs) {
            throw new ForbiddenError(
                'Preflight probe is only available on single-organization instances',
            );
        }
        this.assertCanManageOrganization(account);
    }

    /**
     * Plans a fact's backfill SQL against this instance so the preflight can
     * report how many rows the migration touches. Plain EXPLAIN plans without
     * executing, and the statement is rejected unless it is a single read-only
     * SELECT.
     */
    async explain(
        account: RegisteredAccount,
        sql: string,
    ): Promise<PreflightExplain> {
        this.assertProbeAllowed(account);
        const statement = sql.trim();
        if (statement.length === 0 || statement.length > MAX_SQL_LENGTH) {
            throw new ParameterError(
                `SQL must be between 1 and ${MAX_SQL_LENGTH} characters`,
            );
        }
        if (statement.includes(';')) {
            throw new ParameterError(
                'SQL must be a single statement and must not contain ";"',
            );
        }
        if (!READ_ONLY_SELECT_PATTERN.test(statement)) {
            throw new ParameterError(
                'SQL must be a read-only statement that starts with SELECT or WITH',
            );
        }
        try {
            const plan = await this.preflightModel.explain(
                statement,
                EXPLAIN_TIMEOUT_SECONDS,
            );
            return { plan, error: null };
        } catch (error) {
            // A fact whose SQL does not fit this schema is a coverage gap, not a
            // server fault: report it so the caller can say what it could not check.
            return {
                plan: null,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    async probe(
        account: RegisteredAccount,
        tables: string[],
    ): Promise<PreflightProbe> {
        this.assertProbeAllowed(account);
        const uniqueTables = [...new Set(tables)];
        if (uniqueTables.length > MAX_TABLES) {
            throw new ParameterError(`Pass at most ${MAX_TABLES} tables`);
        }
        for (const table of uniqueTables) {
            if (!TABLE_NAME_PATTERN.test(table)) {
                throw new ParameterError(`Invalid table name: ${table}`);
            }
        }
        const [lock, tableStats, activity] = await Promise.all([
            this.preflightModel.getLockState(),
            this.preflightModel.getTableStats(uniqueTables),
            this.preflightModel.getActivity({
                includeQueryText: !this.lightdashConfig.allowMultiOrgs,
            }),
        ]);
        return {
            serverTime: new Date().toISOString(),
            lock,
            tableStats,
            activity,
        };
    }
}
