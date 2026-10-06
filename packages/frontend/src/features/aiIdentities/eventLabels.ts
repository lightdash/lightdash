import { type AiIdentityEvent } from '@lightdash/common';

const actionLabels: Record<string, string> = {
    provision: 'Provisioning run',
    provision_statement: 'Ran in Snowflake',
    provisioner_verify: 'Provisioner checked',
    tested: 'Tested',
    test: 'Tested',
    bulk_test: 'Tested (bulk)',
    update_override: 'AI identity name changed',
    update_template: 'Naming template changed',
    regenerate_key: 'New key created',
    sync: 'Key created',
    export: 'Exported',
    list: 'Viewed',
    slack_dm: 'Slack message sent',
};

export const actionLabel = (action: string): string =>
    actionLabels[action] ?? action.replace(/_/g, ' ');

export const actorLabel = (event: AiIdentityEvent): string => {
    if (event.actorType === 'scheduler') return 'Lightdash';
    if (event.actorType === 'api') return event.actorName ?? 'API';
    return event.actorName ?? 'An admin';
};
