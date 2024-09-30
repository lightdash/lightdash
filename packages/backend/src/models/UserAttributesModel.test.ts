import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    GroupUserAttributesTable,
    OrganizationMemberUserAttributesTable,
    UserAttributesTable,
} from '../database/entities/userAttributes';
import { UserAttributesModel } from './UserAttributesModel';
import {
    EXPECTED_ORG_MEMBER_ATTRIBUTE_VALUES,
    MOCK_GET_ATTR_VALUES_FOR_ORG_MEMBER_FILTERS,
    MOCK_GROUP_USER_ATTRIBUTES_VALUE,
    MOCK_ORG_MEMBER_ATTRIBUTES_VALUE,
    MOCK_USER_ATTRIBUTES_NAME_DEFAULT_VALUE,
} from './UserAttributesModel.mock';

describe('UserAttributesModel', () => {
    const model = new UserAttributesModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
    });

    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    test('should combine user, group and default attribute values', async () => {
        tracker.on
            .select(UserAttributesTable)
            .responseOnce(MOCK_USER_ATTRIBUTES_NAME_DEFAULT_VALUE);
        tracker.on
            .select(OrganizationMemberUserAttributesTable)
            .responseOnce(MOCK_ORG_MEMBER_ATTRIBUTES_VALUE);
        tracker.on
            .select(GroupUserAttributesTable)
            .responseOnce(MOCK_GROUP_USER_ATTRIBUTES_VALUE);

        const dashboard = await model.getAttributeValuesForOrgMember(
            MOCK_GET_ATTR_VALUES_FOR_ORG_MEMBER_FILTERS,
        );

        expect(dashboard).toEqual(EXPECTED_ORG_MEMBER_ATTRIBUTE_VALUES);
        expect(tracker.history.select).toHaveLength(3);
    });
});
