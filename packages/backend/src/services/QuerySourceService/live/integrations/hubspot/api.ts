import { HUBSPOT_OBJECTS, type HubspotObject } from '@lightdash/common';

/** One search takes at most this many filters in a group. */
export const HUBSPOT_MAX_FILTERS = 6;

/** HubSpot's search returns at most 200 records a call. */
export const HUBSPOT_PAGE_SIZE = 200;

export const HUBSPOT_MAX_PAGES = 5;

export const HUBSPOT_MAX_ROWS = HUBSPOT_PAGE_SIZE * HUBSPOT_MAX_PAGES;

/**
 * API names of the built-in fields: the keys every search result has. They
 * are camelCase, so no property name (lowercase) can take them.
 */
export const HUBSPOT_BUILT_IN_COLUMNS = [
    'id',
    'createdAt',
    'updatedAt',
] as const;

export type HubspotBuiltInColumn = (typeof HUBSPOT_BUILT_IN_COLUMNS)[number];

export const HUBSPOT_COUNT_REASON =
    "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.";

/** Objects as HubSpot names them. */
export const HUBSPOT_OBJECT_LABELS: Record<HubspotObject, string> = {
    deals: 'Deals',
    contacts: 'Contacts',
    companies: 'Companies',
    tickets: 'Tickets',
    leads: 'Leads',
};

/** The explore listing deal and ticket pipelines with their stages. */
export const HUBSPOT_PIPELINE_STAGES = 'pipeline_stages';

/** Columns of a pipeline stages request, one per field. */
export const HUBSPOT_PIPELINE_COLUMNS = [
    'objectType',
    'pipelineId',
    'pipelineLabel',
    'pipelineDisplayOrder',
    'stageId',
    'stageLabel',
    'stageDisplayOrder',
    'probability',
    'isClosed',
] as const;

export type HubspotPipelineColumn = (typeof HUBSPOT_PIPELINE_COLUMNS)[number];

/** The CRM object an explore definition reads. */
export const toHubspotObject = (definitionName: string): HubspotObject => {
    const object = HUBSPOT_OBJECTS.find((name) => name === definitionName);
    if (!object) {
        throw new Error(`"${definitionName}" isn't a HubSpot object`);
    }
    return object;
};

/** A label field's API name: the property it reads, then `:label`. */
export const HUBSPOT_LABEL_SUFFIX = ':label';
