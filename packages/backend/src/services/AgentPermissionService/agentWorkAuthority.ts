import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    buildAgentIdentityClaim,
    InvalidUser,
    type AgentActorSurface,
    type AgentWorkMarker,
    type SessionUser,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fromSession } from '../../auth/account';
import { type AgentActionLogModel } from '../../models/AgentActionLogModel';
import { type UserModel } from '../../models/UserModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../AiAccessService/agentExecutionContext';
import { recordAgentRefusal } from '../AiAccessService/logAgentContentWrite';
import { type AgentPermissionService } from './AgentPermissionService';

const agentWorkMarkerSchema = z.object({
    userUuid: z.string().refine((value) => value.trim().length > 0),
    organizationUuid: z.string().refine((value) => value.trim().length > 0),
    projectUuid: z.string().refine((value) => value.trim().length > 0),
});

export type ParsedAgentWorkMarker =
    | { status: 'absent' }
    | { status: 'valid'; marker: AgentWorkMarker }
    | { status: 'malformed' };

export const parseAgentWorkMarker = (
    payload: Record<string, unknown>,
): ParsedAgentWorkMarker => {
    if (payload.agentWork === undefined) return { status: 'absent' };
    const result = agentWorkMarkerSchema.safeParse(payload.agentWork);
    if (!result.success) return { status: 'malformed' };
    const marker = result.data;
    if (
        (['userUuid', 'organizationUuid', 'projectUuid'] as const).some(
            (key) => payload[key] !== undefined && payload[key] !== marker[key],
        )
    )
        return { status: 'malformed' };
    return { status: 'valid', marker };
};

type AgentWorkDependencies = {
    userModel: Pick<
        UserModel,
        'findSessionUserAndOrgByUuid' | 'findServiceAccountByUserUuid'
    >;
    agentPermissionService: Pick<
        AgentPermissionService,
        'loadRequest' | 'assertOperationWithRequest'
    >;
    agentActionLogModel: Pick<AgentActionLogModel, 'insert'>;
};

type AgentWork = AgentWorkMarker & { surface: AgentActorSurface };

const agentWorkUserRefusal = (work: AgentWork) =>
    new AiAccessRefusedError(AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED, {
        projectUuid: work.projectUuid,
        operation: 'agent_turn',
        policyLayer: 'organization_setting',
    });

export const assertAgentWorkUserActive = async (
    deps: Pick<AgentWorkDependencies, 'userModel' | 'agentActionLogModel'>,
    work: AgentWork,
    user: SessionUser,
): Promise<void> => {
    if (
        user.isActive === false &&
        !(await deps.userModel.findServiceAccountByUserUuid(work.userUuid))
    ) {
        const error = agentWorkUserRefusal(work);
        const current = agentExecutionContext.getStore();
        const context =
            current?.agentIdentityEnabled &&
            current.writerUuid === work.userUuid &&
            current.organizationUuid === work.organizationUuid
                ? current
                : createAgentExecutionContext({
                      account: fromSession(user),
                      surface: work.surface,
                      clientId: null,
                      agentUuid: null,
                      agentIdentityEnabled: true,
                  });
        await agentExecutionContext.run(context, () =>
            recordAgentRefusal({
                model: deps.agentActionLogModel,
                userUuid: work.userUuid,
                organizationUuid: work.organizationUuid,
                projectUuid: work.projectUuid,
                objectType: 'agent_operation',
                objectId: 'agent_turn',
                action: 'agent_turn',
                policyLayer: 'organization_setting',
                reasonCode: error.refusal.reason,
                capability: null,
                error,
            }),
        );
        throw error;
    }
};

export const assertAgentWorkAllowed = async (
    deps: AgentWorkDependencies,
    work: AgentWork,
    options?: { freshlyLoadedUser: SessionUser },
): Promise<SessionUser> => {
    let user: SessionUser;
    try {
        user =
            options?.freshlyLoadedUser ??
            (await deps.userModel.findSessionUserAndOrgByUuid(
                work.userUuid,
                work.organizationUuid,
            ));
        if (
            options &&
            (user.userUuid !== work.userUuid ||
                user.organizationUuid !== work.organizationUuid)
        ) {
            throw new InvalidUser(
                'The person does not match the delivery identity.',
            );
        }
    } catch (error) {
        if (error instanceof InvalidUser) {
            const refusal = agentWorkUserRefusal(work);
            const current = agentExecutionContext.getStore();
            const context =
                current?.agentIdentityEnabled &&
                current.writerUuid === work.userUuid &&
                current.organizationUuid === work.organizationUuid
                    ? current
                    : {
                          surface: work.surface,
                          clientId: null,
                          agentUuid: null,
                          claim: buildAgentIdentityClaim({
                              subject: { type: 'user', uuid: work.userUuid },
                              surface: work.surface,
                              clientId: null,
                              agentUuid: null,
                          }),
                          actor: {
                              type: 'session' as const,
                              uuid: work.userUuid,
                              organizationUuid: work.organizationUuid,
                              organizationRole: 'unknown',
                          },
                          organizationUuid: work.organizationUuid,
                          writerUuid: work.userUuid,
                          operationId: randomUUID(),
                          agentIdentityEnabled: true,
                          agentConnectionExecution: null,
                      };
            await agentExecutionContext.run(context, () =>
                recordAgentRefusal({
                    model: deps.agentActionLogModel,
                    userUuid: work.userUuid,
                    organizationUuid: work.organizationUuid,
                    projectUuid: work.projectUuid,
                    objectType: 'agent_operation',
                    objectId: 'agent_turn',
                    action: 'agent_turn',
                    policyLayer: 'organization_setting',
                    reasonCode: refusal.refusal.reason,
                    capability: null,
                    error: refusal,
                }),
            );
            throw refusal;
        }
        throw error;
    }
    await assertAgentWorkUserActive(deps, work, user);
    const request = await deps.agentPermissionService.loadRequest(
        work.organizationUuid,
    );
    await deps.agentPermissionService.assertOperationWithRequest({
        request,
        operation: {
            account: fromSession(user),
            organizationUuid: work.organizationUuid,
            projectUuid: work.projectUuid,
            kind: 'agent_turn',
            key: 'agent_turn',
            surface: work.surface,
        },
    });
    return user;
};

export const AGENT_DELIVERY_CHECK_INTERVAL_MS = 30_000;

export type AgentDeliveryGuard<T = unknown> = {
    assert: () => Promise<T | undefined>;
    assertIfStale: () => Promise<T | undefined>;
    getFailure: () => { error: unknown } | null;
};

export const createAgentDeliveryGuard = <T>({
    enabled,
    check,
    now,
}: {
    enabled: boolean;
    check: () => Promise<T>;
    now: () => number;
}): AgentDeliveryGuard<T> => {
    let lastSuccessfulCheck: number | null = null;
    let failure: { error: unknown } | null = null;
    const getFailure = () => failure;
    const assert = async () => {
        if (!enabled) return undefined;
        if (failure) throw failure.error;
        try {
            const result = await check();
            const previousFailure = getFailure();
            if (previousFailure) throw previousFailure.error;
            lastSuccessfulCheck = now();
            return result;
        } catch (error) {
            failure ??= { error };
            lastSuccessfulCheck = null;
            throw failure.error;
        }
    };
    return {
        assert,
        getFailure,
        assertIfStale: async () => {
            if (failure) throw failure.error;
            if (
                enabled &&
                (lastSuccessfulCheck === null ||
                    now() - lastSuccessfulCheck >=
                        AGENT_DELIVERY_CHECK_INTERVAL_MS)
            )
                return assert();
            return undefined;
        },
    };
};
