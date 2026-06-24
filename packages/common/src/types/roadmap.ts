import { ParameterError } from './errors';

/**
 * Shared v1 contract for the customer-facing Roadmap feature.
 *
 * A single trusted Roadmap service mirrors Linear feature requests, curates
 * them per org, and serves a read-only view to enterprise customers. The
 * types and constants here are the contract between that service and the
 * Lightdash app, and they encode the curation boundary: only `title`,
 * `description` and a customer-friendly `status` are ever exposed. Internal
 * data (comments, ARR/priority weighting, other accounts' identities) must
 * never cross this boundary.
 */

/**
 * Customer-facing roadmap stage. These are the only statuses a customer ever
 * sees; the raw Linear workflow state is mapped onto one of these.
 */
export enum RoadmapItemStatus {
    BACKLOG = 'Backlog',
    PLANNED = 'Planned',
    BUILDING = 'Building',
    SHIPPED = 'Shipped',
    NOT_PLANNED = 'Not planned',
}

export const ROADMAP_ITEM_STATUSES = Object.values(RoadmapItemStatus);

export const isRoadmapItemStatus = (
    value: unknown,
): value is RoadmapItemStatus =>
    typeof value === 'string' &&
    ROADMAP_ITEM_STATUSES.includes(value as RoadmapItemStatus);

/**
 * A single curated roadmap item, exactly as exposed to customers. These are
 * the only fields allowed across the curation boundary — the subset already
 * synced to the public GitHub issue. `description` is nullable because a Linear
 * issue may have an empty body.
 */
export type RoadmapItem = {
    title: string;
    description: string | null;
    status: RoadmapItemStatus;
};

/**
 * The complete set of keys allowed on a curated {@link RoadmapItem}. The
 * redaction step builds items from exactly these keys and rejects anything
 * else — this is the allowlist that defines the public surface.
 */
export const ROADMAP_ITEM_ALLOWED_FIELDS = [
    'title',
    'description',
    'status',
] as const satisfies ReadonlyArray<keyof RoadmapItem>;

/**
 * Known internal/sensitive field names that must never appear on a curated
 * item. This is a defensive denylist used to fail loudly: the allowlist above
 * already strips unknown fields, but if any of these are seen we reject the
 * payload outright rather than silently dropping it, because their presence
 * means upstream curation is broken.
 *
 * This list is intentionally NOT exhaustive and is not the security boundary —
 * the allowlist reconstruction in {@link redactRoadmapItem} is what actually
 * guarantees nothing but `title`/`description`/`status` is served. This denylist
 * only exists to turn a known curation regression into a loud failure; adding a
 * new sensitive field here is a defence-in-depth nicety, not a requirement.
 */
export const ROADMAP_FORBIDDEN_FIELDS = [
    'comments',
    'comment',
    'discussion',
    'arr',
    'priority',
    'priorityLabel',
    'priorityValue',
    'weight',
    'weighting',
    'estimate',
    'customer',
    'customers',
    'assignee',
    'assigneeId',
    'subscribers',
    'internalNotes',
] as const;

/**
 * Canonical Linear workflow state types. Unlike state names (which teams can
 * rename freely) these six values are fixed by Linear, so they make a robust
 * fallback when a state name isn't recognised.
 */
export enum LinearWorkflowStateType {
    TRIAGE = 'triage',
    BACKLOG = 'backlog',
    UNSTARTED = 'unstarted',
    STARTED = 'started',
    COMPLETED = 'completed',
    CANCELED = 'canceled',
}

/**
 * A Linear workflow state as read from the Linear API. `name` is the
 * human-readable, team-customisable label; `type` is the canonical category.
 */
export type LinearWorkflowState = {
    name: string;
    type: string;
};

/**
 * Primary mapping: Linear state name (lower-cased) -> customer-facing status,
 * exactly as defined in the project design.
 */
export const LINEAR_STATE_NAME_TO_ROADMAP_STATUS: Record<
    string,
    RoadmapItemStatus
> = {
    triage: RoadmapItemStatus.BACKLOG,
    backlog: RoadmapItemStatus.BACKLOG,
    todo: RoadmapItemStatus.PLANNED,
    planned: RoadmapItemStatus.PLANNED,
    'in progress': RoadmapItemStatus.BUILDING,
    done: RoadmapItemStatus.SHIPPED,
    canceled: RoadmapItemStatus.NOT_PLANNED,
    cancelled: RoadmapItemStatus.NOT_PLANNED,
};

/**
 * Fallback mapping by canonical Linear state type, used when a renamed state
 * name isn't in {@link LINEAR_STATE_NAME_TO_ROADMAP_STATUS}.
 */
export const LINEAR_STATE_TYPE_TO_ROADMAP_STATUS: Record<
    LinearWorkflowStateType,
    RoadmapItemStatus
> = {
    [LinearWorkflowStateType.TRIAGE]: RoadmapItemStatus.BACKLOG,
    [LinearWorkflowStateType.BACKLOG]: RoadmapItemStatus.BACKLOG,
    [LinearWorkflowStateType.UNSTARTED]: RoadmapItemStatus.PLANNED,
    [LinearWorkflowStateType.STARTED]: RoadmapItemStatus.BUILDING,
    [LinearWorkflowStateType.COMPLETED]: RoadmapItemStatus.SHIPPED,
    [LinearWorkflowStateType.CANCELED]: RoadmapItemStatus.NOT_PLANNED,
};

/**
 * Map a Linear workflow state to a customer-facing status. Matches on the
 * canonical state type first, since that's fixed by Linear, and only falls
 * back to the (team-customisable) state name when the type is missing or
 * unrecognised — this avoids mislabelling a renamed state (e.g. a `started`
 * state renamed to "Done"). Returns `null` when neither is recognised so the
 * caller can exclude the item rather than mislabelling it.
 */
export const mapLinearStateToRoadmapStatus = (
    state: LinearWorkflowState,
): RoadmapItemStatus | null => {
    const byType =
        LINEAR_STATE_TYPE_TO_ROADMAP_STATUS[
            state.type.trim().toLowerCase() as LinearWorkflowStateType
        ];
    if (byType) {
        return byType;
    }
    const byName =
        LINEAR_STATE_NAME_TO_ROADMAP_STATUS[state.name.trim().toLowerCase()];
    return byName ?? null;
};

/**
 * Build a curated {@link RoadmapItem} from a Linear issue's public parts.
 *
 * This is the curation step run while syncing the mirror: it maps the status
 * and keeps only the allowed fields. Throws {@link ParameterError} if the
 * status can't be mapped, so an item with an unexpected state is never served
 * with a wrong status.
 */
export const buildRoadmapItem = (input: {
    title: string;
    description: string | null;
    state: LinearWorkflowState;
}): RoadmapItem => {
    const status = mapLinearStateToRoadmapStatus(input.state);
    if (status === null) {
        throw new ParameterError(
            `Cannot map Linear state "${input.state.name}" (type "${input.state.type}") to a roadmap status`,
        );
    }
    return {
        title: input.title,
        description: input.description,
        status,
    };
};

/**
 * Return the known internal/sensitive field names present on an arbitrary
 * object (see {@link ROADMAP_FORBIDDEN_FIELDS}). Empty array means none were
 * found. Use this as a redaction-checkpoint alarm before serving.
 */
export const findForbiddenRoadmapFields = (
    raw: Record<string, unknown>,
): string[] =>
    ROADMAP_FORBIDDEN_FIELDS.filter((field) =>
        Object.prototype.hasOwnProperty.call(raw, field),
    );

/**
 * Defensively redact an arbitrary object down to a safe {@link RoadmapItem}.
 *
 * This is the final checkpoint before a curated item is served. It:
 *  - rejects the payload if any known internal/sensitive field is present
 *    (fail loud rather than silently strip — see {@link ROADMAP_FORBIDDEN_FIELDS});
 *  - strips every field not in {@link ROADMAP_ITEM_ALLOWED_FIELDS};
 *  - validates the remaining fields' types.
 *
 * Throws {@link ParameterError} on any validation failure. The throw is an
 * internal alarm for the sync/proxy layer, not a customer-facing response —
 * to serve a list, use {@link redactRoadmapItems}, which excludes a failing
 * item rather than letting its (potentially revealing) error reach a customer.
 */
export const redactRoadmapItem = (
    raw: Record<string, unknown>,
): RoadmapItem => {
    const forbidden = findForbiddenRoadmapFields(raw);
    if (forbidden.length > 0) {
        throw new ParameterError(
            `Roadmap item contains forbidden fields: ${forbidden.join(', ')}`,
        );
    }

    const { title, description, status } = raw;

    if (typeof title !== 'string') {
        throw new ParameterError('Roadmap item is missing a valid "title"');
    }
    if (description !== null && typeof description !== 'string') {
        throw new ParameterError(
            'Roadmap item "description" must be a string or null',
        );
    }
    if (!isRoadmapItemStatus(status)) {
        throw new ParameterError(
            `Roadmap item has an invalid "status": ${String(status)}`,
        );
    }

    // Reconstruct from the allowlist only — no other key can leak through.
    return { title, description, status };
};

/**
 * An item dropped by {@link redactRoadmapItems}.
 *
 * Both fields are for internal logging/alerting only — `reason` can echo the
 * offending field name and must never be sent to a customer. `title` is a
 * best-effort identifier (the raw item's `title` if it's a string, otherwise
 * `undefined`) so an operator can tell *which* item failed curation; `title`
 * is already a public field, so surfacing it internally leaks nothing.
 */
export type RoadmapRedactionRejection = {
    title: string | undefined;
    reason: string;
};

export type RoadmapRedactionResult = {
    items: RoadmapItem[];
    rejected: RoadmapRedactionRejection[];
};

/**
 * Collection-level redaction — the safe entry point for serving a list.
 *
 * Runs {@link redactRoadmapItem} over each raw item and *excludes* any that
 * fail rather than throwing, so a single forbidden/malformed item can never
 * fail the whole response or leak its raw error to a customer. Failures are
 * collected in `rejected` so the sync/proxy layer can log/alert on them
 * internally (their presence means upstream curation is broken).
 */
export const redactRoadmapItems = (
    raw: ReadonlyArray<Record<string, unknown>>,
): RoadmapRedactionResult => {
    const items: RoadmapItem[] = [];
    const rejected: RoadmapRedactionRejection[] = [];
    raw.forEach((item) => {
        try {
            items.push(redactRoadmapItem(item));
        } catch (error) {
            rejected.push({
                title: typeof item.title === 'string' ? item.title : undefined,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    });
    return { items, rejected };
};

export type ApiRoadmapResponse = {
    status: 'ok';
    results: RoadmapItem[];
};
