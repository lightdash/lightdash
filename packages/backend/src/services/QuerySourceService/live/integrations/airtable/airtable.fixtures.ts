export const BASE_ID = 'appAbCdEfGhIjKlMn';
export const TABLE_ID = 'tblAbCdEfGhIjKlMn';

/** A tickets table as `GET /v0/meta/bases/{baseId}/tables` lists it. */
export const TICKETS_TABLE = {
    id: TABLE_ID,
    name: 'Tickets',
    primaryFieldId: 'fld1',
    fields: [
        { id: 'fld1', name: 'Name', type: 'singleLineText' },
        {
            id: 'fld2',
            name: 'Status',
            type: 'singleSelect',
            options: { choices: [{ id: 'sel1', name: 'Open' }] },
        },
        { id: 'fld3', name: 'Assignee', type: 'singleCollaborator' },
        { id: 'fld4', name: 'Story points', type: 'number' },
        { id: 'fld5', name: 'Resolved', type: 'checkbox' },
        { id: 'fld6', name: 'Due', type: 'date' },
        { id: 'fld7', name: 'Closed at', type: 'dateTime' },
        { id: 'fld8', name: 'Tags', type: 'multipleSelects' },
        {
            id: 'fld9',
            name: 'Age (days)',
            type: 'formula',
            options: { result: { type: 'number' } },
        },
        { id: 'fld10', name: 'Open in app', type: 'button' },
        {
            id: 'fld11',
            name: 'Name',
            type: 'multilineText',
            description: 'A second field that reads as Name',
        },
    ],
    views: [{ id: 'viwAbCdEfGhIjKlMn', name: 'Grid view', type: 'grid' }],
};

export const PEOPLE_TABLE_ID = 'tblZyXwVuTsRqPoNm';

/** A second table of the base, which an admin can turn on. */
export const PEOPLE_TABLE = {
    id: PEOPLE_TABLE_ID,
    name: 'People',
    fields: [
        {
            id: 'fld1',
            name: 'Full Name',
            type: 'singleLineText',
            description: 'First and last name',
        },
        { id: 'fld2', name: 'Joined', type: 'date' },
        {
            id: 'fld3',
            name: 'Score',
            type: 'formula',
            options: { result: { type: 'number' } },
        },
        { id: 'fld4', name: 'Email them', type: 'button' },
    ],
};

export const BASE_SCHEMA = {
    tables: [TICKETS_TABLE, PEOPLE_TABLE],
};
