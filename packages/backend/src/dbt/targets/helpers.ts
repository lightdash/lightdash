import type { DbtTargetResult } from '../../services/WarehouseClientFactory/CredentialResolver';

export const DEFAULT_THREADS = 1;
export const envVar = (v: string) =>
    `LIGHTDASH_DBT_PROFILE_VAR_${v.toUpperCase()}`;
export const envVarReference = (v: string) => `{{ env_var('${envVar(v)}') }}`;
export const ambientIdentityTarget = (mode: string): DbtTargetResult => ({
    kind: 'none',
    reason: `${mode} cannot be used to run dbt, because it uses the server's own identity. Use an explicit key or a person's sign-in instead.`,
});
