export const MOCK_GET_ATTR_VALUES_FOR_ORG_MEMBER_FILTERS = {
    organizationUuid: 'fake_org_uuid',
    userUuid: 'fake_user_uuid',
};
export const MOCK_USER_ATTRIBUTES_NAME_DEFAULT_VALUE = [
    {
        user_attribute_uuid: 'fruit',
        name: 'fruit',
        attribute_defaults: ['default_fruit'],
    },
    {
        user_attribute_uuid: 'vegetable',
        name: 'vegetable',
        attribute_defaults: ['default_vegetable'],
    },
    {
        user_attribute_uuid: 'section',
        name: 'section',
        attribute_defaults: null,
    },
    {
        user_attribute_uuid: 'category',
        name: 'category',
        attribute_defaults: null,
    },
    { user_attribute_uuid: 'area', name: 'area', attribute_default: null },
    { user_attribute_uuid: 'region', name: 'region', attribute_default: null },
];

export const MOCK_ORG_MEMBER_ATTRIBUTES_VALUE = [
    { name: 'fruit', values: ['user_fruit'] },
    { name: 'section', values: ['user_section'] },
    { name: 'region', values: ['US', 'CA'] },
];

export const MOCK_GROUP_USER_ATTRIBUTES_VALUE = [
    { name: 'fruit', values: ['group_fruit'] },
    { name: 'area', values: ['group_area'] },
    { name: 'region', values: ['US', 'UK'] },
];

export const EXPECTED_ORG_MEMBER_ATTRIBUTE_VALUES = {
    fruit: ['user_fruit', 'group_fruit'], // expect both user and group values
    vegetable: ['default_vegetable'], // expect default value
    section: ['user_section'], // expect user value
    category: [], // expect no value
    area: ['group_area'], // expect group value
    region: ['US', 'CA', 'UK'], // multi-value user + group, deduped
};
