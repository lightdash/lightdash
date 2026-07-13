import { OnboardingStepStatus, OnboardingStepType } from '@lightdash/common';
import { Knex } from 'knex';
import { OnboardingProjectStateModel } from './OnboardingProjectStateModel';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const updatedAt = new Date('2026-07-13T12:00:00.000Z');

const dbRow = {
    onboarding_project_state_uuid: '22222222-2222-4222-8222-222222222222',
    project_uuid: projectUuid,
    step: OnboardingStepType.CONNECT,
    status: OnboardingStepStatus.COMPLETED,
    result: { warehouse: 'snowflake' },
    created_at: new Date('2026-07-13T11:00:00.000Z'),
    updated_at: updatedAt,
};

describe('OnboardingProjectStateModel', () => {
    it('gets all project steps and maps database fields', async () => {
        const builder: Record<string, import('vitest').Mock> = {};
        Object.assign(builder, {
            where: vi.fn(() => builder),
            orderBy: vi.fn(async () => [dbRow]),
        });
        const database = vi.fn(() => builder) as unknown as Knex;
        const model = new OnboardingProjectStateModel({ database });

        await expect(model.getAll(projectUuid)).resolves.toEqual([
            {
                step: OnboardingStepType.CONNECT,
                status: OnboardingStepStatus.COMPLETED,
                result: { warehouse: 'snowflake' },
                updatedAt,
            },
        ]);
        expect(builder.where).toHaveBeenCalledWith('project_uuid', projectUuid);
        expect(builder.orderBy).toHaveBeenCalledWith('created_at', 'asc');
    });

    it('upserts on project and step and refreshes updated_at', async () => {
        const captured: Record<string, Record<string, unknown>> = {};
        const builder: Record<string, import('vitest').Mock> = {};
        Object.assign(builder, {
            insert: vi.fn((value: Record<string, unknown>) => {
                captured.insert = value;
                return builder;
            }),
            onConflict: vi.fn(() => builder),
            merge: vi.fn((value: Record<string, unknown>) => {
                captured.merge = value;
                return builder;
            }),
            returning: vi.fn(async () => [dbRow]),
        });
        const now = vi.fn(() => 'database-now');
        const database = Object.assign(
            vi.fn(() => builder),
            {
                fn: { now },
            },
        ) as unknown as Knex;
        const model = new OnboardingProjectStateModel({ database });

        await expect(
            model.upsert(
                projectUuid,
                OnboardingStepType.CONNECT,
                OnboardingStepStatus.COMPLETED,
                { warehouse: 'snowflake' },
            ),
        ).resolves.toEqual({
            step: OnboardingStepType.CONNECT,
            status: OnboardingStepStatus.COMPLETED,
            result: { warehouse: 'snowflake' },
            updatedAt,
        });
        expect(builder.onConflict).toHaveBeenCalledWith([
            'project_uuid',
            'step',
        ]);
        expect(captured.insert).toEqual({
            project_uuid: projectUuid,
            step: OnboardingStepType.CONNECT,
            status: OnboardingStepStatus.COMPLETED,
            result: JSON.stringify({ warehouse: 'snowflake' }),
        });
        expect(captured.merge).toEqual({
            status: OnboardingStepStatus.COMPLETED,
            result: JSON.stringify({ warehouse: 'snowflake' }),
            updated_at: 'database-now',
        });
    });
});
