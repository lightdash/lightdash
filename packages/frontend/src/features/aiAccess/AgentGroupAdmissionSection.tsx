import {
    isGroupWithMembers,
    type Group as OrganizationGroup,
} from '@lightdash/common';
import {
    Button,
    Group,
    MultiSelect,
    Radio,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import Callout from '../../components/common/Callout';
import i18n from '../../i18n/i18n';

interface GroupPickerProps {
    groups: OrganizationGroup[];
    selection: string[] | null;
    onChange: (selection: string[] | null) => void;
    disabled: boolean;
    invalid: boolean;
}
interface GroupAdmissionProps extends GroupPickerProps {
    available: boolean;
    savedSelection: string[] | null;
}
const groupOptions = (
    groups: OrganizationGroup[],
    selection: string[] | null,
) => {
    const options = groups.map((group) => ({
        value: group.uuid,
        label: isGroupWithMembers(group)
            ? `${group.name} (${new Set(group.memberUuids).size})`
            : group.name,
    }));
    const visible = new Set(groups.map((group) => group.uuid));
    return [
        ...options,
        ...(selection ?? [])
            .filter((uuid) => !visible.has(uuid))
            .map((uuid) => ({
                value: uuid,
                label: i18n.t('permissionChoices.savedGroupFallback', {
                    ns: 'aiAccess',
                }),
            })),
    ];
};
const AgentGroupPicker = ({
    groups,
    selection,
    onChange,
    disabled,
    invalid,
}: GroupPickerProps) => {
    const { t } = useTranslation('aiAccess');
    return (
        <>
            <Radio.Group
                value={selection === null ? 'everyone' : 'groups'}
                aria-label={t('groupAdmission.title')}
            >
                <Stack gap="sm">
                    <Radio.Card
                        value="everyone"
                        p="md"
                        disabled={disabled}
                        aria-label={t('groupAdmission.everyone')}
                        onClick={() => onChange(null)}
                    >
                        <Group wrap="nowrap">
                            <Radio.Indicator />
                            <Stack gap={0}>
                                <Text fw={500}>
                                    {t('groupAdmission.everyone')}
                                </Text>
                                <Text size="sm" c="dimmed">
                                    {t('groupAdmission.everyoneDescription')}
                                </Text>
                            </Stack>
                        </Group>
                    </Radio.Card>
                    <Radio.Card
                        value="groups"
                        p="md"
                        disabled={disabled}
                        aria-label={t('groupAdmission.onlyGroups')}
                        onClick={() => {
                            if (selection === null) onChange([]);
                        }}
                    >
                        <Group wrap="nowrap">
                            <Radio.Indicator />
                            <Stack gap={0}>
                                <Text fw={500}>
                                    {t('groupAdmission.onlyGroups')}
                                </Text>
                                <Text size="sm" c="dimmed">
                                    {t('groupAdmission.onlyGroupsDescription')}
                                </Text>
                            </Stack>
                        </Group>
                    </Radio.Card>
                </Stack>
            </Radio.Group>
            {selection !== null && (
                <Stack gap="xs">
                    <MultiSelect
                        aria-label={t('groupAdmission.groups')}
                        placeholder={t('groupAdmission.chooseGroups')}
                        data={groupOptions(groups, selection)}
                        value={selection}
                        onChange={onChange}
                        searchable
                        disabled={disabled}
                        error={
                            invalid
                                ? t('groupAdmission.chooseAtLeastOne')
                                : null
                        }
                        nothingFoundMessage={t('groupAdmission.noGroups')}
                    />
                    {groups.length === 0 && (
                        <Text size="sm">{t('groupAdmission.noGroups')}</Text>
                    )}
                    <Text size="sm" c="dimmed">
                        {t('groupAdmission.membersOnlyNote')}
                    </Text>
                </Stack>
            )}
        </>
    );
};
export const AgentGroupAdmissionSection = ({
    available,
    groups,
    selection,
    savedSelection,
    onChange,
    disabled,
    invalid,
}: GroupAdmissionProps) => {
    const { t } = useTranslation('aiAccess');
    if (!available && savedSelection === null) return null;
    const deleted = selection?.length === 0 && savedSelection?.length === 0;
    const notice = deleted ? (
        <Callout variant="warning">{t('groupAdmission.allDeleted')}</Callout>
    ) : null;
    if (!available)
        return (
            <Stack gap="sm">
                <Text size="sm">{t('groupAdmission.unavailable')}</Text>
                {notice}
                <Button
                    variant="default"
                    disabled={disabled || selection === null}
                    onClick={() => onChange(null)}
                >
                    {t('groupAdmission.allowEveryone')}
                </Button>
            </Stack>
        );
    return (
        <Stack gap="sm">
            <Title order={5}>{t('groupAdmission.title')}</Title>
            {notice}
            <AgentGroupPicker
                groups={groups}
                selection={selection}
                onChange={onChange}
                disabled={disabled}
                invalid={invalid}
            />
        </Stack>
    );
};
