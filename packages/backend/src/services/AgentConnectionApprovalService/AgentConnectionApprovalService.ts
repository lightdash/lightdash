import { subject } from '@casl/ability';
import {
    AgentCapability,
    FeatureFlags,
    InvalidUser,
    NotFoundError,
    type Account,
    type AgentConnectionApprovalRequest,
    type AgentConnectionApprovalResponse,
    type LightdashUser,
    type RegisteredAccount,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import { z } from 'zod';
import { fromSession } from '../../auth/account/account';
import { agentConnectionGrantEnabled } from '../../auth/agentConnectionGrants/oauthGrantBinding';
import { oauthApiResource } from '../../auth/oauthScopes/oauthResources';
import { type AgentConnectionApprovalRequestModel } from '../../models/AgentConnectionApprovalRequestModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type OAuth2Model } from '../../models/OAuth2Model';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import { AgentConnectionApprovalError } from './AgentConnectionApprovalError';

const schema = z
    .object({
        clientId: z.literal('lightdash-cli'),
        name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
        projects: z
            .array(
                z
                    .string()
                    .min(1)
                    .max(255)
                    .regex(/^[^\s/\\\u0000-\u001f\u007f?#]+$/),
            )
            .min(1)
            .nullable(),
        capabilities: z
            .array(z.nativeEnum(AgentCapability))
            .max(11)
            .refine((values) => new Set(values).size === values.length),
        expiresInSeconds: z.number().int().min(1).max(604800),
        redirectUri: z
            .string()
            .max(2048)
            .regex(
                /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):([0-9]+)\/callback$/,
            ),
        state: z
            .string()
            .min(22)
            .max(512)
            .regex(/^[A-Za-z0-9_-]+$/),
        codeChallenge: z
            .string()
            .length(43)
            .regex(/^[A-Za-z0-9_-]+$/),
        codeChallengeMethod: z.literal('S256'),
        resource: z.string(),
    })
    .strict();

export const parseAgentConnectionApprovalRequest = (
    input: unknown,
): AgentConnectionApprovalRequest => {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
        throw new AgentConnectionApprovalError('invalid_approval_request');
    if (parsed.data.projects !== null && parsed.data.projects.length > 500)
        throw new AgentConnectionApprovalError('too_many_projects');
    const port = Number(
        /:([0-9]+)\/callback$/.exec(parsed.data.redirectUri)![1],
    );
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
        throw new AgentConnectionApprovalError('invalid_approval_request');
    return parsed.data;
};

export class AgentConnectionApprovalService extends BaseService {
    constructor(
        private readonly deps: {
            siteUrl: string;
            model: Pick<
                AgentConnectionApprovalRequestModel,
                'insertPending' | 'findOwned'
            >;
            userModel: Pick<UserModel, 'findSessionUserAndOrgByUuid'>;
            projectModel: Pick<ProjectModel, 'getAllByOrganizationUuid'>;
            oauthModel: Pick<
                OAuth2Model,
                'getClient' | 'validateRedirectUriStrict'
            >;
            featureFlags: Pick<FeatureFlagModel, 'get'>;
        },
    ) {
        super();
    }

    private async freshPerson(
        account: Account | undefined,
    ): Promise<RegisteredAccount> {
        if (!account)
            throw new AgentConnectionApprovalError('authentication_required');
        if (
            account.authentication.type !== 'session' &&
            account.authentication.type !== 'pat'
        )
            throw new AgentConnectionApprovalError('person_required');
        if (!account.organization.organizationUuid)
            throw new AgentConnectionApprovalError('approval_forbidden');
        const person = await this.deps.userModel
            .findSessionUserAndOrgByUuid(
                account.user.id,
                account.organization.organizationUuid,
            )
            .catch((error: unknown) => {
                if (
                    error instanceof NotFoundError ||
                    error instanceof InvalidUser
                )
                    throw new AgentConnectionApprovalError(
                        'approval_forbidden',
                    );
                throw error;
            });
        if (
            !person.isActive ||
            person.userUuid !== account.user.id ||
            person.organizationUuid !== account.organization.organizationUuid
        )
            throw new AgentConnectionApprovalError('approval_forbidden');
        if (!(await this.isEnabledForUser(person)))
            throw new AgentConnectionApprovalError('agent_identity_disabled');
        return fromSession(person, '');
    }

    async isEnabledForUser(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'> | undefined,
    ): Promise<boolean> {
        if (!user)
            return (
                await this.deps.featureFlags.get({
                    featureFlagId: FeatureFlags.AgentIdentity,
                })
            ).enabled;
        return agentConnectionGrantEnabled(this.deps.featureFlags, user);
    }

    async assertReviewable(
        account: Account | undefined,
        requestUuid: string,
    ): Promise<void> {
        const person = await this.freshPerson(account);
        const row = await this.deps.model.findOwned({
            requestUuid,
            organizationUuid: person.organization.organizationUuid!,
            subjectUserUuid: person.user.id,
        });
        if (
            row.decision_consumed_at !== null ||
            row.callback_consumed_at !== null
        )
            throw new AgentConnectionApprovalError('approval_request_consumed');
    }

    async request(
        account: Account | undefined,
        input: AgentConnectionApprovalRequest,
    ): Promise<AgentConnectionApprovalResponse['results']> {
        const person = await this.freshPerson(account);
        const body = parseAgentConnectionApprovalRequest(input);
        const resource = oauthApiResource(this.deps.siteUrl);
        if (body.resource !== resource)
            throw new AgentConnectionApprovalError('invalid_approval_request');
        const client = await this.deps.oauthModel.getClient(body.clientId);
        if (
            !client ||
            client.id !== 'lightdash-cli' ||
            !client.grants.includes('authorization_code') ||
            !client.grants.includes('refresh_token') ||
            !(await this.deps.oauthModel.validateRedirectUriStrict(
                body.redirectUri,
                client,
            ))
        )
            throw new AgentConnectionApprovalError('invalid_approval_request');
        let projects: string[] | null = null;
        if (body.projects !== null) {
            const candidates =
                await this.deps.projectModel.getAllByOrganizationUuid(
                    person.organization.organizationUuid!,
                );
            const ability = this.createAuditedAbility(person);
            projects = [
                ...new Set(
                    body.projects.map((identifier) => {
                        const project = candidates.find((candidate) =>
                            isUuid(identifier)
                                ? candidate.projectUuid === identifier
                                : candidate.slug === identifier,
                        );
                        if (
                            !project ||
                            !ability.can(
                                'view',
                                subject('Project', {
                                    organizationUuid:
                                        person.organization.organizationUuid!,
                                    projectUuid: project.projectUuid,
                                }),
                            )
                        )
                            throw new AgentConnectionApprovalError(
                                'invalid_approval_request',
                            );
                        return project.projectUuid;
                    }),
                ),
            ];
        }
        const row = await this.deps.model.insertPending({
            organizationUuid: person.organization.organizationUuid!,
            subjectUserUuid: person.user.id,
            clientId: body.clientId,
            name: body.name,
            redirectUri: body.redirectUri,
            state: body.state,
            codeChallenge: body.codeChallenge,
            resource,
            requestedProjects: projects,
            requestedCapabilities: body.capabilities,
            expiresInSeconds: body.expiresInSeconds,
        });
        return {
            authorizationUrl: `${resource}/api/v1/oauth/authorize?agent_request=${row.agent_connection_approval_request_uuid}`,
            issuer: resource,
            resource,
            expiresAt: row.request_expires_at.toISOString(),
        };
    }
}
