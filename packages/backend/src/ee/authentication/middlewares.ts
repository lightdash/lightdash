import { Ability, AbilityBuilder } from '@casl/ability';
import {
    applyServiceAccountAbilities,
    AuthorizationError,
    getErrorMessage,
    OrganizationMemberRole,
    ScimError,
    ServiceAccountScope,
    type MemberAbility,
} from '@lightdash/common';
import { RequestHandler } from 'express';
import { ServiceAccountService } from '../services/ServiceAccountService/ServiceAccountService';

const getRoleForScopes = (scopes: ServiceAccountScope[]) => {
    if (
        scopes.includes(ServiceAccountScope.SCIM_MANAGE) ||
        scopes.includes(ServiceAccountScope.ORG_ADMIN)
    ) {
        return OrganizationMemberRole.ADMIN;
    }
    return OrganizationMemberRole.MEMBER;
};
// Middleware to extract SCIM user details
export const isScimAuthenticated: RequestHandler = async (req, res, next) => {
    // Check for SCIM headers or payload (assuming SCIM details are in the headers for this example)
    const scimToken = req.headers.authorization;
    try {
        // throw if no SCIM token is found
        if (
            !scimToken ||
            typeof scimToken !== 'string' ||
            scimToken.length === 0
        ) {
            throw new Error('No SCIM token provided');
        }
        // split the token into an array
        const tokenParts = scimToken.split(' ');
        if (tokenParts.length !== 2) {
            throw new Error(
                'Invalid SCIM token. Token should be in the format "Bearer <token>"',
            );
        }
        // extract the token from the array
        const token = tokenParts[1];
        // Check if the token is valid
        if (!token) {
            throw new Error('No SCIM token provided');
        }
        // Attach SCIM serviceAccount to request
        const serviceAccount = await req.services
            .getServiceAccountService<ServiceAccountService>()
            .authenticateScim(token, {
                method: req.method,
                path: req.path,
                routePath: req.route.path,
            });
        if (serviceAccount) {
            req.serviceAccount = serviceAccount;
            next();
        } else {
            throw new Error('Invalid SCIM token. Authentication failed.');
        }
    } catch (error) {
        next(
            new ScimError({
                detail: getErrorMessage(error),
                status: 401,
            }),
        );
    }
};

// Middleware to extract service account and check scopes
export const authenticateServiceAccount: RequestHandler = async (
    req,
    res,
    next,
) => {
    // Check for service account headers or payload (assuming service account details are in the headers for this example)
    const token = req.headers.authorization;
    try {
        // throw if no service account token is found
        if (!token || typeof token !== 'string' || token.length === 0) {
            next();
            return;
        }
        // split the token into an array
        const tokenParts = token.split(' ');

        // If it is not a specific Bearer token, we do next, without throwing an error
        // This could be an ApiKey token, or already authenticated user
        if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
            // We will execute the next middleware
            next();
            return;
        }

        // extract the token from the array
        const ServiceAccountToken = tokenParts[1];
        // Check if the token is valid
        if (!ServiceAccountToken) {
            throw new AuthorizationError('No service account token provided');
        }
        // Attach service account serviceAccount to request
        const serviceAccount = await req.services
            .getServiceAccountService<ServiceAccountService>()
            .authenticateServiceAccount(ServiceAccountToken);

        if (!serviceAccount) {
            throw new AuthorizationError(
                'Invalid service account token. Authentication failed.',
            );
        }
        req.serviceAccount = serviceAccount;
        // Create a SessionUser with abilities based on service account scopes
        // Scope validation is done on casl abitly checks
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        applyServiceAccountAbilities({
            scopes: serviceAccount.scopes,
            organizationUuid: serviceAccount.organizationUuid,
            builder,
        });
        const organization = await req.services
            .getOrganizationService()
            .getOrganizationByUuid(serviceAccount.organizationUuid);

        const adminUser = await req.services
            .getUserService()
            .getAdminUser(
                serviceAccount.createdByUserUuid,
                serviceAccount.organizationUuid,
            );

        req.user = {
            userUuid: adminUser.userUuid,
            email: 'service-account@lightdash.com',
            firstName: 'service account',
            lastName: serviceAccount.description,
            organizationUuid: serviceAccount.organizationUuid,
            organizationName: organization.name,
            organizationCreatedAt: serviceAccount.createdAt, // TODO replace with organization.createdAt,
            isTrackingAnonymized: false,
            isMarketingOptedIn: false,
            isSetupComplete: true,
            userId: adminUser.userId,
            role: getRoleForScopes(serviceAccount.scopes),
            ability: builder.build(),
            isActive: true,
            abilityRules: builder.rules,
            createdAt: serviceAccount.createdAt,
            updatedAt: serviceAccount.createdAt,
        };
        next();
    } catch (error) {
        next(new AuthorizationError(getErrorMessage(error)));
    }
};
