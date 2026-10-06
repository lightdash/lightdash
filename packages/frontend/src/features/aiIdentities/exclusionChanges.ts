import { type AiIdentityEvent } from '@lightdash/common';
import { actorLabel } from './eventLabels';

const roleList = new Intl.ListFormat('en-GB', {
    style: 'long',
    type: 'conjunction',
});

type RuleChange = {
    role: string;
    database: string;
    added: string;
    removed: string;
};

const parseChange = (event: AiIdentityEvent): RuleChange | null => {
    const match = event.detail?.match(
        /^(.*?) · Database: (.*?) · Added: (.*?) · Removed: (.*)$/,
    );
    if (!match) return null;
    const [, role, database, added, removed] = match;
    return { role, database, added, removed };
};

const changeSentences = (
    event: AiIdentityEvent,
    change: RuleChange | null,
    roles: string[],
): string[] => {
    const actor = actorLabel(event);
    if (!change) return [`${actor} ${event.detail ?? 'changed AI roles'}`];
    const { role, database, added, removed } = change;
    if (event.action === 'ai_role_created') {
        const qualifier =
            roles.length === 2 ? 'both ' : roles.length > 2 ? 'all ' : '';
        return [
            `${actor} created ${roleList.format(roles)}${added === 'none' ? '' : `, ${qualifier}excluding ${added}`}`,
        ];
    }
    if (event.action === 'ai_role_deleted') return [`${actor} deleted ${role}`];
    return [
        ...(added === 'none' ? [] : [`${actor} excluded ${added} in ${role}`]),
        ...(removed === 'none'
            ? []
            : [`${actor} removed ${removed} from ${role}`]),
        ...(database.includes(' to ')
            ? [`${actor} changed the database from ${database} in ${role}`]
            : []),
    ];
};

export const exclusionChangeRows = (events: AiIdentityEvent[]) => {
    const sorted = [...events].sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const groups = new Map<
        string,
        { event: AiIdentityEvent; change: RuleChange | null; roles: string[] }
    >();
    sorted.forEach((event) => {
        const change = parseChange(event);
        const key =
            event.action === 'ai_role_created' &&
            change &&
            change.removed === 'none'
                ? JSON.stringify([
                      event.createdAt,
                      event.aiIdentityAccountUuid,
                      event.actorType,
                      event.actorUserUuid,
                      event.actorName,
                      change.database,
                      change.added,
                  ])
                : event.aiIdentityEventUuid;
        const group = groups.get(key);
        if (group && change) group.roles.push(change.role);
        else
            groups.set(key, {
                event,
                change,
                roles: change ? [change.role] : [],
            });
    });
    return [...groups.values()].flatMap(({ event, change, roles }) =>
        changeSentences(event, change, roles).map((sentence) => ({
            id: `${event.aiIdentityEventUuid}-${sentence}`,
            createdAt: event.createdAt,
            sentence,
        })),
    );
};
