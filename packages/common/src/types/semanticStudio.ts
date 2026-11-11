import {
    type ModelFragmentChange,
    type ModelFragmentRefusal,
} from '../lightdash/applyModelFragment';
import { type ApiSuccess } from './api/success';
import { type UUID } from './api/uuid';
import { type Explore } from './explore';

export type SemanticLayerApplyMode =
    | 'live'
    | 'pull_request'
    | 'dbt_pull_request';

export type SemanticLayerStatus = {
    /** Whether this person can change this project's models from Semantic Studio. */
    enabled: boolean;
    /** How a change lands: `live` applies a draft here, `pull_request` sends a draft to the project's repository, and `dbt_pull_request` has the agent edit the dbt project in a pull request, with no draft. */
    appliesAs: SemanticLayerApplyMode;
};

export type ApiSemanticLayerStatusResponse = ApiSuccess<SemanticLayerStatus>;

export type SemanticLayerChangeSource = 'draft' | 'undo';

/** One change to a model's YAML. */
export type SemanticLayerModelChange = {
    changeSetUuid: string;
    source: SemanticLayerChangeSource;
    /** The question that asked for this; null when none did. */
    question: string | null;
    /** Whether this change was undone. */
    reverted: boolean;
    createdAt: Date;
    /** Null when the change created the model. */
    contentBefore: string | null;
    /** Null when the change deleted the model. */
    contentAfter: string | null;
    /** The other models the same change set wrote; undoing it reverts them too. */
    otherModels: string[];
};

export type SemanticLayerModelCode = {
    name: string;
    content: string;
    version: number;
    /** Newest first. */
    history: SemanticLayerModelChange[];
};

export type ApiSemanticLayerModelResponse =
    ApiSuccess<SemanticLayerModelCode | null>;

/** How one model's part of a change fared when it was checked on top of a draft. */
export type SemanticLayerDraftItemResult = {
    model: string;
    /** `ready` passed its checks, `unchanged` changes nothing, `failed` carries the error. */
    status: 'ready' | 'unchanged' | 'failed';
    changes: ModelFragmentChange[];
    refusals: ModelFragmentRefusal[];
    error: string | null;
    /** What a person should confirm about a model that passed, such as a relationship measured on part of a table. */
    notes: string[];
};

/** What one drafted change does to one model, as the agent asked for it. */
export type SemanticLayerDraftModelInput = {
    name: string;
    /** What to add or change on the model; null when it only removes. */
    yaml: string | null;
    /** Paths to remove, such as dimensions.amount.metrics.revenue. */
    remove: string[];
    removeModel: boolean;
};

/** One change in a person's draft, replayed on what is live whenever it is read. */
export type SemanticLayerDraftChange = {
    draftChangeUuid: string;
    /** The question that asked for this; null when none did. */
    question: string | null;
    createdAt: Date;
    models: {
        model: string;
        changes: ModelFragmentChange[];
        refusals: ModelFragmentRefusal[];
        /** Why this no longer applies to what is live; null when it does. */
        error: string | null;
    }[];
};

/** A model as the draft leaves it, against what is live. */
export type SemanticLayerDraftModel = {
    model: string;
    /** Null when the draft creates the model. */
    contentBefore: string | null;
    /** Null when the draft removes the model. */
    contentAfter: string | null;
    /** The model as the draft compiles it; null when it is removed or does not compile. */
    explore: Explore | null;
    /** Other people with unpublished changes to this model, by name; never what they changed. */
    alsoChanging: string[];
    /** The latest change someone else published to this model since this draft first touched it; null when none. */
    publishedSince: { by: string | null; at: Date } | null;
};

/** What became of a change that left the draft. */
export type SemanticLayerSettledDraftChange = {
    draftChangeUuid: string;
    status: 'applied' | 'discarded' | 'undone';
    /** The pull request an applied change was sent as; null when it went live on the server. */
    pullRequestUrl: string | null;
};

export type SemanticLayerDraft = {
    /** Oldest first: each builds on the ones before it. */
    changes: SemanticLayerDraftChange[];
    models: SemanticLayerDraftModel[];
    /** Models the draft leaves unable to compile. */
    errors: { model: string; message: string }[];
    settled: SemanticLayerSettledDraftChange[];
};

export type ApiSemanticLayerDraftResponse = ApiSuccess<SemanticLayerDraft>;

export type SemanticLayerDraftApplyResult = {
    /** Null when nothing went live. */
    exploreCount: number | null;
    /** A draft applies whole, so any failure leaves it as it was. */
    failures: { model: string; error: string }[];
    /** The pull request the draft was sent as, for a project whose models live in a repository; null otherwise. */
    pullRequestUrl: string | null;
};

export type ApiSemanticLayerDraftApplyResponse =
    ApiSuccess<SemanticLayerDraftApplyResult>;

/** A saved chart or dashboard the draft would break; at most one uuid is set, to link to it. */
export type SemanticLayerDraftBreak = {
    name: string;
    error: string;
    chartUuid: string | null;
    dashboardUuid: string | null;
};

/** Saved content the draft would break, found by a background check of the draft as it is now. */
export type SemanticLayerDraftImpact = {
    /** `unchecked` when no check has run since the draft or the live models last changed. */
    status: 'unchecked' | 'checking' | 'done' | 'failed';
    breaks: SemanticLayerDraftBreak[];
};

export type ApiSemanticLayerDraftImpactResponse =
    ApiSuccess<SemanticLayerDraftImpact>;

export type SemanticLayerUndoRequest = {
    changeSetUuids: UUID[];
};

export type ApiSemanticLayerUndoResponse = ApiSuccess<{
    exploreCount: number;
}>;

/** A field the draft defines differently or removes, with the saved content that reads it. */
export type SemanticLayerDraftFieldUsage = {
    model: string;
    fieldId: string;
    label: string;
    /** `changed` keeps the field with a different definition, so numbers move; `removed` takes it away. */
    kind: 'changed' | 'removed';
    charts: { uuid: string; name: string }[];
    dashboards: number;
    scheduledDeliveries: number;
};

/** Saved content that reads what the draft changes: what to look at before publishing, whether or not anything breaks. */
export type SemanticLayerDraftUsage = {
    fields: SemanticLayerDraftFieldUsage[];
    /** How many changed or removed fields were looked up; the rest of a very large draft is not. */
    checkedFields: number;
};

export type ApiSemanticLayerDraftUsageResponse =
    ApiSuccess<SemanticLayerDraftUsage>;

/** Which way a change moves in a draft's order. */
export type SemanticLayerDraftMoveDirection = 'earlier' | 'later';

export type ApiSemanticLayerDraftMoveRequest = {
    direction: SemanticLayerDraftMoveDirection;
};
