import {
    FeatureFlags,
    type CreateGroupAttributeValue,
    type CreateUserAttribute,
    type CreateUserAttributeValue,
    type UserAttribute,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Select,
    Stack,
    Switch,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconInfoCircle,
    IconPlus,
    IconTrash,
    IconUserPlus,
    IconUsersPlus,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    useCreateUserAtributesMutation,
    useUpdateUserAtributesMutation,
} from '../../../hooks/useUserAttributes';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import classes from './UserAttributeModal.module.css';

type UserAttributeFormValues = {
    name: string;
    description?: string;
    attributeDefaults: string[] | null;
    users: CreateUserAttributeValue[];
    groups: CreateGroupAttributeValue[];
};

const UserAttributeModal: FC<{
    opened: boolean;
    userAttribute?: UserAttribute;
    allUserAttributes: UserAttribute[];
    onClose: () => void;
}> = ({ opened, userAttribute, allUserAttributes, onClose }) => {
    const { t } = useTranslation('userSettings');
    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const form = useForm<UserAttributeFormValues>({
        initialValues: {
            name: userAttribute?.name || '',
            description: userAttribute?.description,
            users: userAttribute?.users || [],
            groups: userAttribute?.groups || [],
            attributeDefaults: userAttribute?.attributeDefaults || null,
        },
        validate: {
            name: (value: string) => {
                if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
                    return t(
                        'userAttributesPanel.userAttributeModal.validation.invalidName',
                    );
                }
                if (
                    allUserAttributes.some(
                        (attr) =>
                            attr.name === value &&
                            attr.uuid !== userAttribute?.uuid,
                    )
                ) {
                    return t(
                        'userAttributesPanel.userAttributeModal.validation.duplicateName',
                    );
                }
                return null;
            },
            users: (value: { userUuid: string; values?: string[] }[]) => {
                if (
                    value.reduceRight(
                        (acc, user, index) =>
                            acc ||
                            value.some(
                                (otherUser, otherIndex) =>
                                    index !== otherIndex &&
                                    user.userUuid === otherUser.userUuid,
                            ),
                        false,
                    )
                ) {
                    return t(
                        'userAttributesPanel.userAttributeModal.validation.duplicatedUsers',
                    );
                }
                if (value.some((user) => (user.values?.length ?? 0) === 0)) {
                    return t(
                        'userAttributesPanel.userAttributeModal.validation.userValueRequired',
                    );
                }
                return null;
            },
            groups: (value: { groupUuid: string; values?: string[] }[]) => {
                if (
                    value.reduceRight(
                        (acc, group, index) =>
                            acc ||
                            value.some(
                                (otherGroup, otherIndex) =>
                                    index !== otherIndex &&
                                    group.groupUuid === otherGroup.groupUuid,
                            ),
                        false,
                    )
                ) {
                    return t(
                        'userAttributesPanel.userAttributeModal.validation.duplicatedGroups',
                    );
                }
                if (value.some((group) => (group.values?.length ?? 0) === 0)) {
                    return t(
                        'userAttributesPanel.userAttributeModal.validation.groupValueRequired',
                    );
                }
                return null;
            },
        },
    });
    const [inputError, setInputError] = useState<string | undefined>();
    const { mutate: createUserAttribute } = useCreateUserAtributesMutation();
    const { mutate: updateUserAttribute } = useUpdateUserAtributesMutation(
        userAttribute?.uuid,
    );
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        //Reset checked on edit
        setChecked(
            userAttribute?.attributeDefaults !== undefined &&
                userAttribute?.attributeDefaults !== null,
        );
    }, [userAttribute?.attributeDefaults]);

    const handleClose = () => {
        form.reset();
        setInputError(undefined);
        setChecked(false);
        if (onClose) onClose();
    };
    const handleSubmit = (data: UserAttributeFormValues) => {
        const payload: CreateUserAttribute = data;
        if (userAttribute?.uuid) {
            updateUserAttribute(payload);
        } else {
            createUserAttribute(payload);
        }
        handleClose();
    };

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.data?.enabled ?? false;

    const { data: orgUsers } = useOrganizationUsers();
    const { data: groups } = useOrganizationGroups(
        {},
        { enabled: isGroupManagementEnabled },
    );

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={
                userAttribute
                    ? t('userAttributesPanel.userAttributeModal.updateTitle')
                    : t('userAttributesPanel.userAttributeModal.addTitle')
            }
            icon={IconPlus}
            size="lg"
            actions={
                <Button type="submit" form="add_user_attribute">
                    {userAttribute
                        ? t('actions.update', { ns: 'common' })
                        : t('actions.add', { ns: 'common' })}
                </Button>
            }
        >
            <form
                id="add_user_attribute"
                name="add_user_attribute"
                onSubmit={form.onSubmit((values: UserAttributeFormValues) =>
                    handleSubmit(values),
                )}
            >
                <Stack gap="xs">
                    <TextInput
                        name="name"
                        label={t(
                            'userAttributesPanel.userAttributeModal.nameLabel',
                        )}
                        placeholder={t(
                            'userAttributesPanel.userAttributeModal.namePlaceholder',
                        )}
                        required
                        {...form.getInputProps('name')}
                    />
                    <Text c="red" size="sm">
                        {inputError}
                    </Text>

                    <Textarea
                        name="description"
                        label={t(
                            'userAttributesPanel.userAttributeModal.descriptionLabel',
                        )}
                        placeholder={t(
                            'userAttributesPanel.userAttributeModal.descriptionPlaceholder',
                        )}
                        {...form.getInputProps('description')}
                    />
                    <Stack gap="xxs">
                        <Group gap="xs">
                            <Text fw={500}>
                                {t(
                                    'userAttributesPanel.userAttributeModal.defaultValue',
                                )}
                            </Text>

                            <Tooltip
                                position="right"
                                maw={200}
                                label={t(
                                    'userAttributesPanel.userAttributeModal.defaultValueTooltip',
                                )}
                            >
                                <MantineIcon
                                    color="gray.6"
                                    icon={IconInfoCircle}
                                />
                            </Tooltip>
                        </Group>

                        <Group h={36}>
                            <Switch
                                checked={checked}
                                onChange={(event) => {
                                    const isChecked =
                                        event.currentTarget.checked;
                                    setChecked(isChecked);
                                    if (!isChecked)
                                        form.setFieldValue(
                                            'attributeDefaults',
                                            null,
                                        );
                                }}
                            />
                            {checked && (
                                <TagsInput
                                    size="xs"
                                    flex={1}
                                    name={`attributeDefaults`}
                                    placeholder={t(
                                        'userAttributesPanel.userAttributeModal.valuesPlaceholder',
                                    )}
                                    {...form.getInputProps('attributeDefaults')}
                                    value={form.values.attributeDefaults ?? []}
                                />
                            )}
                        </Group>
                    </Stack>
                    <Stack>
                        <Stack gap="xs">
                            <Text fw={500}>
                                {t(
                                    'userAttributesPanel.userAttributeModal.assignToUsers',
                                )}
                            </Text>
                            {!form.isValid('users') && (
                                <Text c="red" size="xs">
                                    {form.errors.users}
                                </Text>
                            )}

                            {form.values.users?.map((user, index) => {
                                return (
                                    <Group key={index}>
                                        <Select
                                            size="xs"
                                            flex={1}
                                            label={
                                                index === 0
                                                    ? t(
                                                          'userAttributesPanel.userAttributeModal.userEmail',
                                                      )
                                                    : undefined
                                            }
                                            name={`users.${index}.userUuid`}
                                            placeholder={t(
                                                'userAttributesPanel.userAttributeModal.userEmailPlaceholder',
                                            )}
                                            required
                                            searchable
                                            {...form.getInputProps(
                                                `users.${index}.userUuid`,
                                            )}
                                            data={
                                                orgUsers?.map((orgUser) => ({
                                                    value: orgUser.userUuid,
                                                    label: orgUser.email,
                                                })) || []
                                            }
                                        />

                                        <TagsInput
                                            size="xs"
                                            flex={1}
                                            label={
                                                index === 0
                                                    ? t(
                                                          'userAttributesPanel.userAttributeModal.values',
                                                      )
                                                    : undefined
                                            }
                                            name={`users.${index}.values`}
                                            placeholder={t(
                                                'userAttributesPanel.userAttributeModal.valuesPlaceholder',
                                            )}
                                            {...form.getInputProps(
                                                `users.${index}.values`,
                                            )}
                                            value={user.values ?? []}
                                        />
                                        <ActionIcon
                                            mt={index === 0 ? 20 : undefined}
                                            color="red"
                                            variant="outline"
                                            onClick={() => {
                                                form.setFieldValue(
                                                    'users',
                                                    form.values.users.filter(
                                                        (_, i) => i !== index,
                                                    ),
                                                );
                                            }}
                                        >
                                            <MantineIcon icon={IconTrash} />
                                        </ActionIcon>
                                    </Group>
                                );
                            })}
                            <Button
                                size="xs"
                                variant="default"
                                className={classes.addButton}
                                leftSection={
                                    <MantineIcon icon={IconUserPlus} />
                                }
                                onClick={() => {
                                    form.setFieldValue('users', [
                                        ...(form.values.users || []),
                                        { userUuid: '', values: [] },
                                    ]);
                                }}
                            >
                                {t(
                                    'userAttributesPanel.userAttributeModal.addUser',
                                )}
                            </Button>
                        </Stack>

                        {isGroupManagementEnabled && (
                            <Stack gap="xs">
                                <Text fw={500}>
                                    {t(
                                        'userAttributesPanel.userAttributeModal.assignToGroups',
                                    )}
                                </Text>
                                {!form.isValid('groups') && (
                                    <Text c="red" size="xs">
                                        {form.errors.groups}
                                    </Text>
                                )}
                                {form.values.groups.map((group, index) => {
                                    return (
                                        <Group key={index}>
                                            <Select
                                                size="xs"
                                                flex={1}
                                                label={
                                                    index === 0
                                                        ? t(
                                                              'userAttributesPanel.userAttributeModal.groupName',
                                                          )
                                                        : undefined
                                                }
                                                name={`groups.${index}.groupUuid`}
                                                placeholder={t(
                                                    'userAttributesPanel.userAttributeModal.groupNamePlaceholder',
                                                )}
                                                required
                                                searchable
                                                {...form.getInputProps(
                                                    `groups.${index}.groupUuid`,
                                                )}
                                                data={
                                                    groups?.map(
                                                        (groupInfo) => ({
                                                            value: groupInfo.uuid,
                                                            label: groupInfo.name,
                                                        }),
                                                    ) || []
                                                }
                                            />

                                            <TagsInput
                                                size="xs"
                                                flex={1}
                                                label={
                                                    index === 0
                                                        ? t(
                                                              'userAttributesPanel.userAttributeModal.values',
                                                          )
                                                        : undefined
                                                }
                                                name={`groups.${index}.values`}
                                                placeholder={t(
                                                    'userAttributesPanel.userAttributeModal.valuesPlaceholder',
                                                )}
                                                {...form.getInputProps(
                                                    `groups.${index}.values`,
                                                )}
                                                value={group.values ?? []}
                                            />
                                            <ActionIcon
                                                mt={
                                                    index === 0 ? 20 : undefined
                                                }
                                                color="red"
                                                variant="outline"
                                                onClick={() => {
                                                    form.setFieldValue(
                                                        'groups',
                                                        form.values.groups.filter(
                                                            (_, i) =>
                                                                i !== index,
                                                        ),
                                                    );
                                                }}
                                            >
                                                <MantineIcon icon={IconTrash} />
                                            </ActionIcon>
                                        </Group>
                                    );
                                })}
                                <Button
                                    size="xs"
                                    variant="default"
                                    className={classes.addButton}
                                    leftSection={
                                        <MantineIcon icon={IconUsersPlus} />
                                    }
                                    onClick={() => {
                                        form.insertListItem('groups', {
                                            groupUuid: '',
                                            values: [],
                                        });
                                    }}
                                >
                                    {t(
                                        'userAttributesPanel.userAttributeModal.addGroup',
                                    )}
                                </Button>
                            </Stack>
                        )}
                    </Stack>
                </Stack>
            </form>
        </MantineModal>
    );
};

export default UserAttributeModal;
