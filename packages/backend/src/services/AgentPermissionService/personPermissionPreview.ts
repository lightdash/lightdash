import { subject } from '@casl/ability';
import {
    AgentCapability,
    type AgentAccessPreviewActionId,
    type MemberAbility,
} from '@lightdash/common';

type PreviewContext = { organizationUuid: string; projectUuid: string | null };
type PreviewResult = {
    status: 'allowed' | 'refused' | 'not_checked';
    message: string;
};
type PersonPermissionPredicate = (
    ability: MemberAbility,
    context: PreviewContext,
) => PreviewResult;

const notChecked =
    (message: string): PersonPermissionPredicate =>
    () => ({ status: 'not_checked', message });
const prerequisite = (
    allowed: boolean,
    description: string,
    remaining = '',
): PreviewResult => ({
    status: allowed ? 'allowed' : 'refused',
    message: `This person's roles ${allowed ? 'allow' : 'do not allow'} ${description}.${remaining ? ` ${remaining}` : ''}`,
});
const sqlRunner: PersonPermissionPredicate = (ability, context) =>
    context.projectUuid === null
        ? {
              status: 'not_checked',
              message: 'Select a project to check SQL Runner access.',
          }
        : prerequisite(
              ability.can(
                  'manage',
                  subject('SqlRunner', {
                      organizationUuid: context.organizationUuid,
                      projectUuid: context.projectUuid,
                  }),
              ),
              'SQL Runner in this project',
          );
const branch = notChecked(
    'Branch protection is not selected. Repository changes are checked when the agent acts.',
);
const content = notChecked(
    'The chart or destination space is not selected. Content access is checked when the agent acts.',
);
const deletion = notChecked(
    'The content and its type are not selected. Delete access is checked when the agent acts.',
);
const exports = notChecked(
    'Export depends on the chart and format. It is checked when the agent acts.',
);

export const PERSON_PERMISSION_PREVIEWS: Record<
    AgentAccessPreviewActionId,
    PersonPermissionPredicate
> = {
    [`capability:${AgentCapability.ReadDiscover}`]: (ability, context) =>
        context.projectUuid === null
            ? {
                  status: 'not_checked',
                  message: 'Select a project to check project visibility.',
              }
            : prerequisite(
                  ability.can(
                      'view',
                      subject('Project', {
                          organizationUuid: context.organizationUuid,
                          projectUuid: context.projectUuid,
                      }),
                  ),
                  'viewing this project',
                  'Content and data model access are checked when the agent acts.',
              ),
    [`capability:${AgentCapability.Query}`]: notChecked(
        'The data model or saved content is not selected. Query access is checked when the agent acts.',
    ),
    [`capability:${AgentCapability.RawSql}`]: sqlRunner,
    [`capability:${AgentCapability.ContentWrite}`]: content,
    [`capability:${AgentCapability.Delete}`]: deletion,
    [`capability:${AgentCapability.Publish}`]: notChecked(
        'Publishing, sharing and deliveries need content and audience details. Access is checked when the agent acts.',
    ),
    [`capability:${AgentCapability.DeployUpload}`]: notChecked(
        'Deployments and uploads have different permissions. Access is checked when the agent acts.',
    ),
    [`capability:${AgentCapability.DbtWriteback}`]: branch,
    [`capability:${AgentCapability.Export}`]: exports,
    [`capability:${AgentCapability.Administration}`]: notChecked(
        'Administration actions have different permissions. Access is checked when the agent acts.',
    ),
    [`capability:${AgentCapability.ExternalTools}`]: notChecked(
        'Connected service permissions are checked when the agent acts.',
    ),
    run_raw_sql: sqlRunner,
    schedule_delivery: (ability, context) =>
        context.projectUuid === null
            ? {
                  status: 'not_checked',
                  message:
                      'Select a project to check delivery creation access.',
              }
            : prerequisite(
                  ability.can(
                      'create',
                      subject('ScheduledDeliveries', {
                          organizationUuid: context.organizationUuid,
                          projectUuid: context.projectUuid,
                      }),
                  ),
                  'creating scheduled deliveries in this project',
                  'The content, destination and format are checked when the agent acts.',
              ),
    export_results: exports,
    create_edit_chart: content,
    delete_content: deletion,
    publish_dashboard: notChecked(
        'The dashboard, parent project and destination are not selected. Promotion access is checked when the agent acts.',
    ),
    change_dbt_files: branch,
    run_saved_sql_chart: (ability, context) => {
        const result = sqlRunner(ability, context);
        return {
            ...result,
            message: `${result.message} Saved SQL chart access is checked when the agent acts.`,
        };
    },
    delete_repository_file: branch,
    change_agent_permissions: (ability, { organizationUuid }) =>
        prerequisite(
            ability.can(
                'manage',
                subject('Organization', { organizationUuid }),
            ),
            'managing this organization',
        ),
};
