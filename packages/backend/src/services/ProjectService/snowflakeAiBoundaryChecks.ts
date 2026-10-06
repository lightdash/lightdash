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

type BoundaryClient = {
    runQuery(
        sql: string,
        tags: Record<string, string>,
    ): Promise<{ rows: Record<string, unknown>[] }>;
};

const getValue = (row: Record<string, unknown> | undefined, key: string) =>
    row && key in row ? row[key] : row?.[key.toLowerCase()];

const resultScanScopeLimit =
    "The session scope does not block RESULT_SCAN from reading the same person's earlier query results.";

export const getUnavailableSnowflakeAiBoundaryChecks =
    (): SnowflakeAiBoundaryCheck[] => [
        {
            id: 'agent_active',
            status: 'fail',
            detail: 'Could not verify the agent session and Restricted Session Scope.',
            fixStep: 2,
        },
        {
            id: 'current_role',
            status: 'skipped',
            detail: 'The agent session is unavailable.',
            fixStep: 4,
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
            detail: `The agent session is unavailable. ${resultScanScopeLimit}`,
            fixStep: 4,
        },
        {
            id: 'secondary_roles_blocked',
            status: 'skipped',
            detail: 'The agent session is unavailable.',
            fixStep: 4,
        },
    ];

export const runSnowflakeAiBoundaryChecks = async ({
    client,
    protectedColumn,
    warehouseQueryId,
}: {
    client: BoundaryClient;
    protectedColumn: SnowflakeAiBoundaryTestBody['protectedColumn'];
    warehouseQueryId: string | null;
}): Promise<SnowflakeAiBoundaryCheck[]> => {
    const results: SnowflakeAiBoundaryCheck[] = [];
    try {
        const { rows } = await client.runQuery(
            "SELECT SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED') AS AGENT_ACTIVE, CURRENT_ROLE() AS CURRENT_ROLE, SYS_CONTEXT('SNOWFLAKE$SESSION', 'ACTIVE_RESTRICTED_SESSION_SCOPES') AS ACTIVE_SCOPES",
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
        const role = getValue(rows[0], 'CURRENT_ROLE');
        let agentDetail =
            'Agent session and Restricted Session Scope are active.';
        if (!active)
            agentDetail =
                'The Snowflake sign-in for AI did not start an agent session.';
        else if (!scoped)
            agentDetail = 'No Restricted Session Scope is active.';
        results.push({
            id: 'agent_active',
            status: active && scoped ? 'pass' : 'fail',
            detail: agentDetail,
            fixStep: !active ? 2 : 4,
        });
        results.push({
            id: 'current_role',
            status: role ? 'pass' : 'fail',
            detail: role
                ? `Current role: ${String(role)}`
                : 'Could not read the current role.',
            fixStep: 4,
        });
        if (!active || !scoped) {
            return [
                ...results,
                {
                    id: 'masked_column',
                    status: 'skipped',
                    detail: 'The agent session or Restricted Session Scope is inactive.',
                    fixStep: 3,
                },
                {
                    id: 'result_scan_blocked',
                    status: 'skipped',
                    detail: resultScanScopeLimit,
                    fixStep: 4,
                },
                {
                    id: 'secondary_roles_blocked',
                    status: 'skipped',
                    detail: 'The agent session or Restricted Session Scope is inactive.',
                    fixStep: 4,
                },
            ];
        }
    } catch {
        return getUnavailableSnowflakeAiBoundaryChecks();
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

    if (warehouseQueryId === null) {
        results.push({
            id: 'result_scan_blocked',
            status: 'skipped',
            detail: `Run a chart with your regular Snowflake sign-in, then test again. ${resultScanScopeLimit}`,
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
                detail: `The agent session can read an earlier result from your regular sign-in. ${resultScanScopeLimit}`,
                fixStep: 4,
            });
        } catch (error) {
            results.push({
                id: 'result_scan_blocked',
                status: 'pass',
                detail: `An earlier query result is unavailable to the agent session. ${resultScanScopeLimit} Snowflake said: ${getErrorMessage(error)}`,
                fixStep: 4,
            });
        }
    }
    try {
        await client.runQuery('USE SECONDARY ROLES ALL', {});
        results.push({
            id: 'secondary_roles_blocked',
            status: 'fail',
            detail: 'The agent session can switch to secondary roles.',
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
    memberCount,
    signedInMemberCount,
    restrictionsOn,
}: { restrictionsOn: boolean } & Pick<
    SnowflakeAiBoundaryGuideConfig,
    'state' | 'aiSignInEnabled' | 'memberCount' | 'signedInMemberCount'
>): SnowflakeAiBoundaryGuideConfig['statuses'] => {
    const checks = state.lastTest?.checks ?? [];
    const checkStatus = (
        ids: SnowflakeAiBoundaryCheck['id'][],
    ): SnowflakeAiBoundarySectionStatus | null => {
        const selected = checks.filter((check) => ids.includes(check.id));
        if (selected.some((check) => check.status === 'fail'))
            return 'needs_attention';
        if (
            selected.length === ids.length &&
            selected.every((check) => check.status === 'pass')
        )
            return 'verified';
        return null;
    };
    const marked = (section: SnowflakeAiBoundarySection) =>
        state.marks[section]
            ? ('marked_done' as const)
            : ('not_started' as const);
    let signInStatus: SnowflakeAiBoundarySectionStatus = 'not_started';
    if (memberCount > 0 && signedInMemberCount === memberCount)
        signInStatus = 'verified';
    else if (restrictionsOn) signInStatus = 'needs_attention';
    return {
        prerequisites:
            checkStatus(['agent_active', 'masked_column']) === 'verified'
                ? 'verified'
                : marked('prerequisites'),
        masking: checkStatus(['masked_column']) ?? marked('masking'),
        session_policy:
            checkStatus([
                'agent_active',
                'current_role',
                'secondary_roles_blocked',
            ]) ?? marked('session_policy'),
        sign_in: signInStatus,
        oauth: aiSignInEnabled ? 'verified' : marked('oauth'),
        query_procedure: marked('query_procedure'),
        checks:
            checkStatus([
                'agent_active',
                'current_role',
                'masked_column',
                'result_scan_blocked',
                'secondary_roles_blocked',
            ]) ?? 'not_started',
    };
};
