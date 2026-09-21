import { createHmac } from 'crypto';

export const PRE_AGGREGATE_EXECUTION_SCOPE_ARTIFACT =
    'lightdash.preaggregate.execution-scope.v1';

/** Nonsecret key identifier for inventorying artifacts before retiring a key.
 * The artifact domain prevents correlating unrelated signed artifact types. */
export const getSecretArtifactKeyId = (
    secret: string,
    artifact: string,
): string => createHmac('sha256', secret).update(artifact).digest('hex');
