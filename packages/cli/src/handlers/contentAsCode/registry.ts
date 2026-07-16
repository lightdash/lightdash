import {
    ContentAsCodeType,
    ParameterError,
    type ContentAsCodeResourceKind,
} from '@lightdash/common';
import { CUSTOM_ROLE_CODE_RESOURCE } from '../organizationContent/customRoles';
import { GROUP_CODE_RESOURCE } from '../organizationContent/groups';
import { USER_CODE_RESOURCE } from '../organizationContent/users';
import {
    AI_AGENT_CODE_RESOURCE,
    ALERT_CODE_RESOURCE,
    GOOGLE_SHEETS_CODE_RESOURCE,
    SCHEDULED_DELIVERY_CODE_RESOURCE,
    VIRTUAL_VIEW_CODE_RESOURCE,
} from './projectResources';

export type CodeResourceRegistration = {
    kind: ContentAsCodeResourceKind;
    dependencies: readonly ContentAsCodeResourceKind[];
};

export const ORGANIZATION_CODE_RESOURCES: readonly CodeResourceRegistration[] =
    [CUSTOM_ROLE_CODE_RESOURCE, USER_CODE_RESOURCE, GROUP_CODE_RESOURCE];

export const PROJECT_CODE_RESOURCES: readonly CodeResourceRegistration[] = [
    { kind: ContentAsCodeType.SPACE, dependencies: [] },
    VIRTUAL_VIEW_CODE_RESOURCE,
    {
        kind: ContentAsCodeType.CHART,
        dependencies: [ContentAsCodeType.SPACE, ContentAsCodeType.VIRTUAL_VIEW],
    },
    {
        kind: ContentAsCodeType.SQL_CHART,
        dependencies: [ContentAsCodeType.SPACE],
    },
    {
        kind: ContentAsCodeType.DASHBOARD,
        dependencies: [
            ContentAsCodeType.SPACE,
            ContentAsCodeType.CHART,
            ContentAsCodeType.SQL_CHART,
        ],
    },
    AI_AGENT_CODE_RESOURCE,
    SCHEDULED_DELIVERY_CODE_RESOURCE,
    ALERT_CODE_RESOURCE,
    GOOGLE_SHEETS_CODE_RESOURCE,
];

export const assertCodeResourceDependencyOrder = (
    resources: readonly CodeResourceRegistration[],
): void => {
    const completed = new Set<ContentAsCodeResourceKind>();
    for (const resource of resources) {
        const missingDependencies = resource.dependencies.filter(
            (dependency) => !completed.has(dependency),
        );
        if (missingDependencies.length > 0) {
            throw new ParameterError(
                `Content-as-code resource "${resource.kind}" must run after ${missingDependencies.join(
                    ', ',
                )}`,
            );
        }
        completed.add(resource.kind);
    }
};
