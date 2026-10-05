import {
    getErrorMessage,
    quoteSnowflakeAiIdentifier,
    SNOWFLAKE_AI_STRING_MASK,
    type SnowflakeAiBoundaryCheck,
    type SnowflakeAiBoundaryGuideConfig,
    type SnowflakeAiBoundarySection,
    type SnowflakeAiBoundarySectionStatus,
    type SnowflakeAiBoundaryTestBody,
} from '@lightdash/common';

type ReadOnlyClient = {
    runQuery(
        sql: string,
        tags: Record<string, string>,
    ): Promise<{ rows: Record<string, unknown>[] }>;
};

const getValue = (row: Record<string, unknown> | undefined, key: string) =>
    row && key in row ? row[key] : row?.[key.toLowerCase()];

export const getUnavailableSnowflakeAiBoundaryChecks =
    (): SnowflakeAiBoundaryCheck[] => [
        {
            id: 'agent_active',
            status: 'fail',
            detail: 'Could not verify the agent session and restricted scope.',
            fixStep: 2,
        },
        {
            id: 'masked_column',
            status: 'skipped',
            detail: 'The agent session is unavailable.',
            fixStep: 3,
        },
        {
            id: 'result_scan_blocked',
            status: 'skipped',
            detail: 'The agent session is unavailable.',
            fixStep: 4,
        },
        {
            id: 'secondary_roles_blocked',
            status: 'skipped',
            detail: 'The agent session is unavailable.',
            fixStep: 4,
        },
    ];

export const getSnowflakeEarlierResultsCoverage = (
    restrictionsEnabled: boolean,
): SnowflakeAiBoundaryCheck => ({
    id: 'result_scan_blocked',
    status: restrictionsEnabled ? 'covered' : 'not_covered',
    detail: restrictionsEnabled
        ? 'Snowflake lets an AI session read earlier query results. Lightdash covers this by turning off raw SQL from AI while restrictions are on.'
        : 'Snowflake lets an AI session read earlier query results. Turn on AI access restrictions to turn off raw SQL from AI.',
    fixStep: 7,
});

export const runSnowflakeAiBoundaryChecks = async ({
    client,
    protectedColumn,
    warehouseQueryId,
    aiIdentitiesEnabled = true,
    restrictionsEnabled = false,
}: {
    client: ReadOnlyClient;
    protectedColumn: SnowflakeAiBoundaryTestBody['protectedColumn'];
    warehouseQueryId: string | null;
    aiIdentitiesEnabled?: boolean;
    restrictionsEnabled?: boolean;
}): Promise<SnowflakeAiBoundaryCheck[]> => {
    const results: SnowflakeAiBoundaryCheck[] = [];
    try {
        const { rows } = await client.runQuery(
            "SELECT SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED') AS AGENT_ACTIVE, SYS_CONTEXT('SNOWFLAKE$SESSION', 'ACTIVE_RESTRICTED_SESSION_SCOPES') AS ACTIVE_SCOPES",
            {},
        );
        const active =
            String(getValue(rows[0], 'AGENT_ACTIVE')).toLowerCase() === 'true';
        const scope = getValue(rows[0], 'ACTIVE_SCOPES');
        const scoped =
            scope !== null &&
            scope !== undefined &&
            String(scope).trim() !== '' &&
            String(scope) !== '[]';
        let detail = 'Agent session and restricted scope are active.';
        if (!active) detail = 'The AI sign-in did not start an agent session.';
        else if (!scoped) detail = 'No restricted session scope is active.';
        results.push({
            id: 'agent_active',
            status: active && scoped ? 'pass' : 'fail',
            detail,
            fixStep: !active ? 2 : 4,
        });
    } catch {
        return getUnavailableSnowflakeAiBoundaryChecks().map((check) =>
            !aiIdentitiesEnabled && check.id === 'result_scan_blocked'
                ? getSnowflakeEarlierResultsCoverage(restrictionsEnabled)
                : check,
        );
    }

    if (protectedColumn === null) {
        results.push({
            id: 'masked_column',
            status: 'skipped',
            detail: 'Choose a protected column to check masking.',
            fixStep: 3,
        });
    } else {
        const table = [
            protectedColumn.database,
            protectedColumn.schema,
            protectedColumn.table,
        ]
            .map(quoteSnowflakeAiIdentifier)
            .join('.');
        const column = quoteSnowflakeAiIdentifier(protectedColumn.column);
        try {
            const { rows } = await client.runQuery(
                `SELECT COUNT(*) AS TOTAL, COUNT_IF(${column} IS NOT NULL AND TO_VARCHAR(${column}) <> '${SNOWFLAKE_AI_STRING_MASK}') AS UNMASKED FROM ${table}`,
                {},
            );
            const safe =
                Number(getValue(rows[0], 'TOTAL')) > 0 &&
                Number(getValue(rows[0], 'UNMASKED')) === 0;
            results.push({
                id: 'masked_column',
                status: safe ? 'pass' : 'fail',
                detail: safe
                    ? 'The selected column is masked for this agent session.'
                    : 'The selected column is not fully masked, or its table is empty.',
                fixStep: 3,
            });
        } catch {
            results.push({
                id: 'masked_column',
                status: 'fail',
                detail: 'Could not verify the selected protected column.',
                fixStep: 3,
            });
        }
    }

    if (!aiIdentitiesEnabled) {
        results.push(getSnowflakeEarlierResultsCoverage(restrictionsEnabled));
    } else if (warehouseQueryId === null) {
        results.push({
            id: 'result_scan_blocked',
            status: 'skipped',
            detail: 'Run any chart in this project first, then test again.',
            fixStep: 4,
        });
    } else {
        if (!/^[A-Za-z0-9_-]+$/.test(warehouseQueryId)) {
            throw new Error('Invalid warehouse query id');
        }
        try {
            await client.runQuery(
                `SELECT COUNT(*) FROM TABLE(RESULT_SCAN('${warehouseQueryId}'))`,
                {},
            );
            results.push({
                id: 'result_scan_blocked',
                status: 'fail',
                detail: 'Your AI identity can read an earlier result from your personal sign-in. Review the AI identity before allowing AI requests.',
                fixStep: 5,
            });
        } catch (error) {
            results.push({
                id: 'result_scan_blocked',
                status: 'pass',
                detail: `An earlier query result is unavailable to the agent session. Snowflake said: ${getErrorMessage(error)}`,
                fixStep: 4,
            });
        }
    }

    try {
        await client.runQuery('USE SECONDARY ROLES ALL', {});
        results.push({
            id: 'secondary_roles_blocked',
            status: 'fail',
            detail: 'The agent session can activate secondary roles.',
            fixStep: 4,
        });
    } catch (error) {
        results.push({
            id: 'secondary_roles_blocked',
            status: 'pass',
            detail: `Secondary roles are blocked. Snowflake said: ${getErrorMessage(error)}`,
            fixStep: 4,
        });
    }
    return results;
};

export const getSnowflakeAiBoundaryStatuses = ({
    state,
    aiSignInEnabled,
    aiIdentitiesEnabled,
    memberCount,
    readyIdentityCount,
    signedInMemberCount,
    restrictionsOn,
}: { restrictionsOn: boolean } & Pick<
    SnowflakeAiBoundaryGuideConfig,
    | 'state'
    | 'aiSignInEnabled'
    | 'aiIdentitiesEnabled'
    | 'memberCount'
    | 'readyIdentityCount'
    | 'signedInMemberCount'
>): SnowflakeAiBoundaryGuideConfig['statuses'] => {
    const checks =
        state.lastTest?.aiIdentitiesEnabled === aiIdentitiesEnabled
            ? state.lastTest.checks
            : [];
    const checkStatus = (
        ids: SnowflakeAiBoundaryCheck['id'][],
    ): SnowflakeAiBoundarySectionStatus | null => {
        const selected = checks.filter((check) => ids.includes(check.id));
        if (
            selected.some(
                (check) =>
                    check.status === 'fail' || check.status === 'not_covered',
            )
        )
            return 'needs_attention';
        if (
            selected.length === ids.length &&
            selected.every(
                (check) =>
                    check.status === 'pass' || check.status === 'covered',
            )
        )
            return 'verified';
        return null;
    };
    const marked = (section: SnowflakeAiBoundarySection) =>
        state.marks[section]
            ? ('marked_done' as const)
            : ('not_started' as const);
    const ready = aiIdentitiesEnabled
        ? readyIdentityCount
        : signedInMemberCount;
    return {
        prerequisites:
            checkStatus(['agent_active', 'masked_column']) === 'verified'
                ? 'verified'
                : marked('prerequisites'),
        masking: checkStatus(['masked_column']) ?? marked('masking'),
        session_policy:
            checkStatus(['agent_active', 'secondary_roles_blocked']) ??
            marked('session_policy'),
        identities: (() => {
            if (memberCount > 0 && ready === memberCount) return 'verified';
            return restrictionsOn ? 'needs_attention' : 'not_started';
        })(),
        oauth: aiSignInEnabled ? 'verified' : marked('oauth'),
        checks:
            checkStatus([
                'agent_active',
                'masked_column',
                'result_scan_blocked',
                'secondary_roles_blocked',
            ]) ?? 'not_started',
    };
};
