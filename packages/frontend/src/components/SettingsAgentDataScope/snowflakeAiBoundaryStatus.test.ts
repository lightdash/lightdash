import { describe, expect, it } from 'vitest';
import { getSnowflakeAiBoundaryStepStatuses } from './snowflakeAiBoundaryStatus';

describe('Snowflake AI boundary guide statuses', () => {
    const base = {
        isSnowflake: true,
        enterpriseConfirmed: false,
        roleConfirmed: false,
        aiSignInEnabled: false,
        maskingConfirmed: false,
        ceilingConfirmed: false,
        signedIn: false,
        checks: null,
        restrictionsEnabled: false,
    } as const;

    it('stops on a non-Snowflake project', () => {
        expect(
            getSnowflakeAiBoundaryStepStatuses({
                ...base,
                isSnowflake: false,
            })[0],
        ).toBe('failed');
    });

    it('derives done states from current configuration and confirmations', () => {
        expect(
            getSnowflakeAiBoundaryStepStatuses({
                ...base,
                enterpriseConfirmed: true,
                roleConfirmed: true,
                aiSignInEnabled: true,
                maskingConfirmed: true,
                ceilingConfirmed: true,
                signedIn: true,
                restrictionsEnabled: true,
            }),
        ).toEqual(['done', 'done', 'done', 'done', 'done', 'to do', 'done']);
    });

    it('marks failed checks as failed and skipped checks as to do', () => {
        expect(
            getSnowflakeAiBoundaryStepStatuses({
                ...base,
                checks: [
                    {
                        id: 'agent_active',
                        status: 'fail',
                        detail: '',
                        fixStep: 2,
                    },
                ],
            })[5],
        ).toBe('failed');
        expect(
            getSnowflakeAiBoundaryStepStatuses({
                ...base,
                checks: [
                    {
                        id: 'masked_column',
                        status: 'skipped',
                        detail: '',
                        fixStep: 3,
                    },
                ],
            })[5],
        ).toBe('to do');
    });

    it('keeps completed steps done after the admin moves on', () => {
        expect(
            getSnowflakeAiBoundaryStepStatuses({
                ...base,
                enterpriseConfirmed: true,
                roleConfirmed: true,
                maskingConfirmed: true,
                ceilingConfirmed: true,
            }).slice(0, 4),
        ).toEqual(['done', 'to do', 'done', 'done']);
    });
});
