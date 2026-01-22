import { UNASSIGNED_OWNER, type CatalogOwner } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Popover,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { clsx } from '@mantine/core';
import { IconSearch, IconUser, IconX } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricOwners } from '../../hooks/useMetricOwners';
import styles from './CategoriesFilter.module.css';

type OwnersFilterProps = {
    selectedOwners: string[];
    setSelectedOwners: (owners: string[]) => void;
};

const getOwnerDisplayName = (owner: CatalogOwner) =>
    `${owner.firstName} ${owner.lastName}`;

const OwnersFilter: FC<OwnersFilterProps> = ({
    selectedOwners,
    setSelectedOwners,
}) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const [searchValue, setSearchValue] = useState('');

    const { data: owners, isLoading } = useMetricOwners({ projectUuid });

    // Filter owners by search (name or email)
    const filteredOwners = useMemo(() => {
        if (!owners) return [];
        if (!searchValue) return owners;
        const searchLower = searchValue.toLowerCase();
        return owners.filter(
            (owner) =>
                getOwnerDisplayName(owner)
                    .toLowerCase()
                    .includes(searchLower) ||
                owner.email.toLowerCase().includes(searchLower),
        );
    }, [owners, searchValue]);

    const hasSelectedOwners = selectedOwners.length > 0;

    const ownerNames = useMemo(() => {
        const unassigned = selectedOwners.includes(UNASSIGNED_OWNER);
        const selectedUserUuids = selectedOwners.filter(
            (o) => o !== UNASSIGNED_OWNER,
        );
        const names =
            owners
                ?.filter((o) => selectedUserUuids.includes(o.userUuid))
                .map(getOwnerDisplayName) ?? [];

        return names.concat(unassigned ? ['Unassigned'] : []).join(', ');
    }, [selectedOwners, owners]);

    const buttonLabel = hasSelectedOwners ? ownerNames : 'All owners';

    return (
        <Group gap={2}>
            <Popover width={300} position="bottom-start" shadow="sm">
                <Popover.Target>
                    <Tooltip
                        withinPortal
                        label="Filter metrics by owner"
                        openDelay={200}
                        maw={250}
                        fz="xs"
                    >
                        <Button
                            h={32}
                            c="ldGray.7"
                            fw={500}
                            fz="sm"
                            variant="default"
                            radius="md"
                            py="xs"
                            px="sm"
                            leftSection={
                                <MantineIcon
                                    icon={IconUser}
                                    size="md"
                                    color={
                                        hasSelectedOwners
                                            ? 'indigo.5'
                                            : 'ldGray.5'
                                    }
                                />
                            }
                            loading={isLoading}
                            className={clsx(
                                styles.filterButton,
                                hasSelectedOwners &&
                                    styles.filterButtonSelected,
                            )}
                            classNames={{
                                label: styles.filterButtonLabel,
                            }}
                        >
                            {buttonLabel}
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                    <Stack gap={4}>
                        <Text fz="xs" c="ldGray.6" fw={600}>
                            Filter by owner:
                        </Text>

                        {(owners?.length ?? 0) > 5 && (
                            <TextInput
                                size="xs"
                                placeholder="Search owners..."
                                value={searchValue}
                                onChange={(e) =>
                                    setSearchValue(e.currentTarget.value)
                                }
                                rightSection={
                                    searchValue ? (
                                        <ActionIcon
                                            size="xs"
                                            onClick={() => setSearchValue('')}
                                        >
                                            <MantineIcon icon={IconX} />
                                        </ActionIcon>
                                    ) : (
                                        <MantineIcon
                                            icon={IconSearch}
                                            color="ldGray.5"
                                        />
                                    )
                                }
                            />
                        )}

                        {owners?.length === 0 && (
                            <Text fz="xs" fw={500} c="ldGray.6">
                                No owners configured yet. Add spotlight.owner in
                                your metric or model YAML to assign owners.
                            </Text>
                        )}

                        <Stack
                            gap="xs"
                            mah={300}
                            mt="xxs"
                            className={styles.scrollableList}
                        >
                            {filteredOwners.map((owner) => (
                                <Checkbox
                                    key={owner.userUuid}
                                    label={getOwnerDisplayName(owner)}
                                    checked={selectedOwners.includes(
                                        owner.userUuid,
                                    )}
                                    size="xs"
                                    classNames={{
                                        body: styles.checkbox,
                                        input: styles.checkboxInput,
                                    }}
                                    onChange={() => {
                                        if (
                                            selectedOwners.includes(
                                                owner.userUuid,
                                            )
                                        ) {
                                            setSelectedOwners(
                                                selectedOwners.filter(
                                                    (o) => o !== owner.userUuid,
                                                ),
                                            );
                                        } else {
                                            setSelectedOwners([
                                                ...selectedOwners,
                                                owner.userUuid,
                                            ]);
                                        }
                                    }}
                                />
                            ))}
                            {!searchValue && (owners?.length ?? 0) > 0 && (
                                <Checkbox
                                    label="Unassigned"
                                    checked={selectedOwners.includes(
                                        UNASSIGNED_OWNER,
                                    )}
                                    fw={500}
                                    size="xs"
                                    classNames={{
                                        body: styles.checkbox,
                                        input: styles.checkboxInput,
                                    }}
                                    onChange={() => {
                                        if (
                                            selectedOwners.includes(
                                                UNASSIGNED_OWNER,
                                            )
                                        ) {
                                            setSelectedOwners(
                                                selectedOwners.filter(
                                                    (o) =>
                                                        o !== UNASSIGNED_OWNER,
                                                ),
                                            );
                                        } else {
                                            setSelectedOwners([
                                                ...selectedOwners,
                                                UNASSIGNED_OWNER,
                                            ]);
                                        }
                                    }}
                                />
                            )}
                            {filteredOwners.length === 0 &&
                                (owners?.length ?? 0) > 0 && (
                                    <Text fz="xs" c="ldGray.5">
                                        No owners match your search.
                                    </Text>
                                )}
                        </Stack>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedOwners && (
                <Tooltip label="Clear all owner filters">
                    <ActionIcon
                        size="xs"
                        color="ldGray.5"
                        variant="subtle"
                        onClick={() => {
                            setSelectedOwners([]);
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default OwnersFilter;
