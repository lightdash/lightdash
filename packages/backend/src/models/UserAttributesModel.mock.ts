export const MOCK_GET_ATTR_VALUES_FOR_ORG_MEMBER_FILTERS = {
    organizationUuid: 'fake_org_uuid',
    userUuid: 'fake_user_uuid',
};
export const MOCK_USER_ATTRIBUTES_NAME_DEFAULT_VALUE = [
    { name: 'fruit', attribute_default: 'default_fruit' },
    { name: 'vegetable', attribute_default: 'default_vegetable' },
    { name: 'section', attribute_default: null },
    { name: 'category', attribute_default: null },
];

export const MOCK_ORG_MEMBER_ATTRIBUTES_VALUE = [
    { name: 'fruit', value: 'user_fruit' },
    { name: 'section', value: 'user_section' },
];

export const EXPECTED_ORG_MEMBER_ATTRIBUTE_VALUES = {
    fruit: 'user_fruit',
    vegetable: 'default_vegetable',
    section: 'user_section',
    category: null,
};
