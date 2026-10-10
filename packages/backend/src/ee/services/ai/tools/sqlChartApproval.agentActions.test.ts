import { defaultSessionUser } from '../../../../auth/account/account.mock';
import {
    agentActionTestCases,
    withAgentActionScope,
} from '../../../../services/AiAccessService/agentActionTestUtils.mock';
import { recordAgentRefusal } from '../../../../services/AiAccessService/logAgentContentWrite';
import { SqlNotApprovedError } from './sqlApprovals';
import { createSqlChartGate, type SqlChartSaving } from './sqlChartApproval';

describe.each(agentActionTestCases)(
    'SQL approval refusal: %s',
    (_, surface, enabled, count) => {
        test.each(['disabled', 'rejected', 'timeout'] as const)(
            '%s',
            async (outcome) => {
                const model = { insert: vi.fn().mockResolvedValue(undefined) };
                const saving: SqlChartSaving = {
                    mode:
                        outcome === 'disabled' ? 'disabled' : 'client_approved',
                    recordRefusal: (action, reasonCode) =>
                        recordAgentRefusal({
                            model,
                            userUuid: defaultSessionUser.userUuid,
                            organizationUuid:
                                defaultSessionUser.organizationUuid,
                            projectUuid: 'project',
                            objectType: 'sql_chart',
                            action,
                            policyLayer: 'sql_approval',
                            reasonCode,
                        }),
                };
                const gate = createSqlChartGate(saving, 'createContent');
                const execute = vi.fn().mockImplementation(async () => {
                    throw new SqlNotApprovedError(
                        outcome === 'timeout' ? 'timeout' : 'rejected',
                        'secret SQL',
                    );
                });
                await withAgentActionScope(
                    defaultSessionUser,
                    surface,
                    enabled,
                    async () => {
                        const result = gate.run(
                            {
                                toolCallId: 'call',
                                args: {
                                    type: 'sql_chart',
                                    content: { sql: 'secret SQL' },
                                },
                            },
                            execute,
                        );
                        if (outcome === 'disabled') await result;
                        else
                            await expect(result).rejects.toThrow(
                                SqlNotApprovedError,
                            );
                    },
                );
                expect(model.insert).toHaveBeenCalledTimes(count);
                if (count)
                    expect(model.insert).toHaveBeenCalledWith(
                        expect.objectContaining({
                            outcome: 'denied',
                            policy_layer: 'sql_approval',
                            reason_code:
                                outcome === 'disabled'
                                    ? 'sql_mode_disabled'
                                    : `sql_approval_${outcome}`,
                            object_uuid: null,
                        }),
                    );
                expect(JSON.stringify(model.insert.mock.calls)).not.toContain(
                    'secret',
                );
                if (outcome === 'disabled')
                    expect(execute).not.toHaveBeenCalled();
            },
        );
    },
);
