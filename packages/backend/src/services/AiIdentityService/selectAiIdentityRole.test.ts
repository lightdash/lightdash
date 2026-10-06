import { type AiIdentityRoleMapping } from '@lightdash/common';
import { selectAiIdentityRole } from './selectAiIdentityRole';

const identity = {
    provisionedRole: null,
    groupUuids: ['one', 'two'],
    snowflakeLogin: 'PERSON',
    twinName: 'PERSON_AI',
};
const mapping = (groupUuid: string, aiRole: string): AiIdentityRoleMapping => ({
    groupUuid,
    aiRole,
    groupName: groupUuid,
    aiIdentityRoleMappingUuid: groupUuid,
    priority: 0,
});

describe('selectAiIdentityRole', () => {
    it('uses the provisioned role first', () => {
        expect(
            selectAiIdentityRole(
                { ...identity, provisionedRole: 'PROVISIONED' },
                [mapping('one', 'MAPPED')],
                'TEMPLATE',
            ),
        ).toBe('PROVISIONED');
    });
    it('uses a group mapping before the account template', () => {
        expect(
            selectAiIdentityRole(
                identity,
                [mapping('one', 'MAPPED')],
                'TEMPLATE',
            ),
        ).toBe('MAPPED');
    });
    it('fails closed when several group roles apply', () => {
        expect(
            selectAiIdentityRole(
                identity,
                [mapping('one', 'FIRST'), mapping('two', 'SECOND')],
                'TEMPLATE',
            ),
        ).toBeNull();
    });
    it('accepts several groups with the same role', () => {
        expect(
            selectAiIdentityRole(
                identity,
                [mapping('one', 'SAME'), mapping('two', 'same')],
                null,
            ),
        ).toBe('SAME');
    });
    it('falls back to the account template', () => {
        expect(selectAiIdentityRole(identity, [], 'TEMPLATE')).toBe('TEMPLATE');
    });
    it('fails closed without a known role', () => {
        expect(selectAiIdentityRole(identity, [], null)).toBeNull();
    });
});
