import { subject, type Ability } from '@casl/ability';
import {
    AgentCapability,
    assertUnreachable,
    type UUID,
} from '@lightdash/common';
import { type CaslAuditWrapper } from '../../logging/caslAuditWrapper';

export const personAllowsAgentCapability = (
    ability: Pick<CaslAuditWrapper<Ability>, 'can'>,
    organizationUuid: UUID,
    projectUuid: UUID,
    capability: AgentCapability,
): boolean => {
    const resource = {
        organizationUuid,
        projectUuid,
    };
    const content = {
        ...resource,
        inheritsFromOrgOrProject: true,
        access: [],
    };
    switch (capability) {
        case AgentCapability.ReadDiscover:
            return ability.can('view', subject('Project', { ...resource }));
        case AgentCapability.Query:
            return ability.can('view', subject('Explore', { ...resource }));
        case AgentCapability.RawSql:
            return ability.can('manage', subject('SqlRunner', { ...resource }));
        case AgentCapability.ContentWrite:
            return (
                ability.can('create', subject('SavedChart', { ...content })) ||
                ability.can('create', subject('Dashboard', { ...content })) ||
                ability.can('create', subject('Document', { ...content })) ||
                ability.can('create', subject('DataApp', { ...content }))
            );
        case AgentCapability.Delete:
            return (
                ability.can('delete', subject('SavedChart', { ...content })) ||
                ability.can('delete', subject('Dashboard', { ...content })) ||
                ability.can('delete', subject('Document', { ...content })) ||
                ability.can('delete', subject('DataApp', { ...content }))
            );
        case AgentCapability.Publish:
            return (
                ability.can('promote', subject('SavedChart', { ...content })) ||
                ability.can('promote', subject('Dashboard', { ...content })) ||
                ability.can(
                    'manage',
                    subject('ContentVerification', { ...resource }),
                ) ||
                ability.can(
                    'create',
                    subject('ScheduledDeliveries', { ...resource }),
                )
            );
        case AgentCapability.DeployUpload:
            return (
                ability.can(
                    'manage',
                    subject('DeployProject', { ...resource }),
                ) ||
                ability.can(
                    'manage',
                    subject('CompileProject', { ...resource }),
                )
            );
        case AgentCapability.DbtWriteback:
            return ability.can(
                'manage',
                subject('SourceCode', {
                    ...resource,
                    isProtectedBranch: false,
                }),
            );
        case AgentCapability.Export:
            return ability.can('manage', subject('ExportCsv', { ...resource }));
        case AgentCapability.Administration:
            return (
                ability.can('manage', subject('Project', { ...resource })) ||
                ability.can(
                    'manage',
                    subject('Organization', {
                        organizationUuid: resource.organizationUuid,
                    }),
                )
            );
        case AgentCapability.ExternalTools:
            return ability.can(
                'view',
                subject('ExternalConnection', { ...resource }),
            );
        default:
            return assertUnreachable(capability, 'Unknown agent capability');
    }
};
