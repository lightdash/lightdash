import { type AiAgentUserAccessDetail } from '@lightdash/common';
import {
    Badge,
    Group,
    Loader,
    MultiSelect,
    Stack,
    Text,
    Tooltip,
    type ComboboxItem,
    type ComboboxLikeRenderOptionInput,
    type MultiSelectProps,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import isEmpty from 'lodash/isEmpty';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { LightdashUserAvatar } from '../../components/Avatar';
import MantineIcon from '../../components/common/MantineIcon';
import { useProjectUsersWithRoles } from '../../hooks/useProjectUsersWithRoles';
import {
    getAgentUserAccessOption,
    getAgentUserLabel,
    type AgentUserAccessOption,
} from './agentUserAccessOption';

const NO_SELECTED_USER_DETAILS: AiAgentUserAccessDetail[] = [];

interface UserAccessMultiSelectProps extends Omit<
    MultiSelectProps,
    'data' | 'renderOption'
> {
    projectUuid: string;
    isGroupsEnabled?: boolean;
    /**
     * The selected users as the agent reports them. The org user search is
     * paginated, so a selected user is often not among the results the
     * picker has loaded; this is what labels their pill instead of the uuid.
     */
    selectedUserDetails?: AiAgentUserAccessDetail[];
}

export const UserAccessMultiSelect: FC<UserAccessMultiSelectProps> = ({
    projectUuid,
    isGroupsEnabled = false,
    selectedUserDetails = NO_SELECTED_USER_DETAILS,
    value = [],
    onChange,
    ...props
}) => {
    const { t } = useTranslation('eeMisc');
    const [searchInput, setSearchInput] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(searchInput, 300);
    const allUsersRef = useRef<Map<string, AgentUserAccessOption>>(new Map());

    const { usersWithProjectRole, isLoading: isLoadingUsers } =
        useProjectUsersWithRoles(projectUuid, {
            searchInput: debouncedSearch,
            paginateArgs: {
                page: 1,
                pageSize: 100,
            },
        });

    const currentSearchResults = useMemo(() => {
        const currentResults: string[] = [];

        for (const user of usersWithProjectRole) {
            const userData = getAgentUserAccessOption(user);
            if (!userData) continue;

            allUsersRef.current.set(userData.userUuid, userData);
            currentResults.push(userData.userUuid);
        }

        return currentResults;
    }, [usersWithProjectRole]);

    const selectData = useMemo(() => {
        const dataMap = new Map<string, { value: string; label: string }>();

        currentSearchResults.forEach((userUuid) => {
            const user = allUsersRef.current.get(userUuid);
            if (user) {
                dataMap.set(userUuid, {
                    value: user.userUuid,
                    label: user.label,
                });
            }
        });

        value.forEach((selectedUuid) => {
            if (dataMap.has(selectedUuid)) return;

            const user = allUsersRef.current.get(selectedUuid);
            if (user) {
                dataMap.set(selectedUuid, {
                    value: user.userUuid,
                    label: user.label,
                });
                return;
            }

            const detail = selectedUserDetails.find(
                (d) => d.userUuid === selectedUuid,
            );
            if (detail) {
                dataMap.set(selectedUuid, {
                    value: detail.userUuid,
                    label: getAgentUserLabel(detail),
                });
            }
        });

        return Array.from(dataMap.values());
    }, [currentSearchResults, value, selectedUserDetails]);

    const renderMultiSelectOption: (
        item: ComboboxLikeRenderOptionInput<ComboboxItem>,
    ) => React.ReactNode = useCallback(
        ({ option }) => {
            if (isEmpty(currentSearchResults)) {
                return (
                    <Text size="sm" c="dimmed">
                        {t('userAccess.noUsers')}
                    </Text>
                );
            }

            const user = allUsersRef.current.get(option.value);

            if (!user) {
                return (
                    <Group gap="sm">
                        <LightdashUserAvatar name="?" size="sm" radius="xl" />
                        <Text size="sm" fw={500}>
                            {option.label}
                        </Text>
                    </Group>
                );
            }

            return (
                <Group gap="sm">
                    <LightdashUserAvatar
                        name={user.label}
                        size="sm"
                        radius="xl"
                        userUuid={user.userUuid}
                    />
                    <Stack gap="two">
                        <Group gap="xs">
                            <Text size="sm" fw={500}>
                                {user.label}
                            </Text>
                            <Badge
                                size="xs"
                                p="2px 4px"
                                variant="outline"
                                color="ldGray.6"
                                fz="8px"
                            >
                                {user.roleLabel}
                            </Badge>
                        </Group>
                        <Text size="xs" c="dimmed" fw={400}>
                            {user.email}
                        </Text>
                    </Stack>
                </Group>
            );
        },
        [currentSearchResults, t],
    );

    return (
        <MultiSelect
            variant="subtle"
            renderOption={renderMultiSelectOption}
            hidePickedOptions
            label={
                <Group gap="xs">
                    <Text fz="sm" fw={500}>
                        {t('userAccess.label')}
                    </Text>
                    <Tooltip
                        label={t('userAccess.tooltip')}
                        position="right"
                        maw="250px"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </Tooltip>
                </Group>
            }
            description={
                isGroupsEnabled
                    ? t('userAccess.descriptionWithGroups')
                    : t('userAccess.description')
            }
            placeholder={t('userAccess.placeholder')}
            data={selectData}
            clearable
            searchable
            readOnly={isLoadingUsers}
            rightSection={isLoadingUsers && <Loader size="xs" />}
            limit={100}
            comboboxProps={{
                transitionProps: {
                    transition: 'pop',
                    duration: 200,
                },
            }}
            value={value}
            onChange={(newValue) => {
                onChange?.(newValue.length > 0 ? newValue : []);
            }}
            onSearchChange={setSearchInput}
            {...props}
        />
    );
};
