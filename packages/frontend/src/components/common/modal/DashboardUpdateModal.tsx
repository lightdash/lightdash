import { type ContentOwnerAssignment, type Dashboard } from '@lightdash/common';
import {
    Button,
    Select,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';
import useHealth from '../../../hooks/health/useHealth';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import Callout from '../Callout';
import MantineModal from '../MantineModal';
import { PalettePicker } from '../PalettePicker/PalettePicker';

interface DashboardUpdateModalProps {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<Dashboard, 'name' | 'description'> & {
    colorPaletteUuid: string | null;
    // Encoded as `user:<uuid>` or `group:<uuid>`; null = no owner
    ownerValue: string | null;
};

const encodeOwner = (ownership: Dashboard['ownership']): string | null => {
    if (!ownership) return null;
    return ownership.owner.type === 'user'
        ? `user:${ownership.owner.userUuid}`
        : `group:${ownership.owner.groupUuid}`;
};

const decodeOwner = (value: string | null): ContentOwnerAssignment | null => {
    if (!value) return null;
    const [type, uuid] = value.split(':');
    return type === 'user'
        ? { type: 'user', userUuid: uuid }
        : { type: 'group', groupUuid: uuid };
};

const DashboardUpdateModal: FC<DashboardUpdateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const projectUuid = useProjectUuid();
    const { data: dashboard, isInitialLoading } = useDashboardQuery({
        uuidOrSlug: uuid,
        projectUuid,
    });
    const { data: palettes = [] } = useColorPalettes();
    const { data: health } = useHealth();
    const { mutateAsync, isLoading: isUpdating } = useUpdateDashboard(
        uuid,
        projectUuid,
    );
    const { data: organizationUsers } = useOrganizationUsers();
    const { data: organizationGroups } = useOrganizationGroups({});

    const form = useForm<FormState>({
        initialValues: {
            name: '',
            description: '',
            colorPaletteUuid: null,
            ownerValue: null,
        },
    });

    const { setValues } = form;

    useEffect(() => {
        if (!dashboard) return;

        setValues({
            name: dashboard.name,
            description: dashboard.description ?? '',
            colorPaletteUuid: dashboard.colorPaletteUuid ?? null,
            ownerValue: encodeOwner(dashboard.ownership),
        });
    }, [dashboard, setValues]);

    if (isInitialLoading || !dashboard) {
        return null;
    }

    const overrideActive =
        !!health?.appearance.overrideColorPalette &&
        health.appearance.overrideColorPalette.length > 0;

    const ownerOptions = [
        {
            group: 'Users',
            items: (organizationUsers ?? []).map((member) => ({
                value: `user:${member.userUuid}`,
                label:
                    `${member.firstName} ${member.lastName}`.trim() ||
                    member.email,
            })),
        },
        {
            group: 'Groups',
            items: (organizationGroups ?? []).map((group) => ({
                value: `group:${group.uuid}`,
                label: group.name,
            })),
        },
    ];

    const handleConfirm = form.onSubmit(async (data) => {
        const ownerChanged =
            data.ownerValue !== encodeOwner(dashboard.ownership);
        await mutateAsync({
            name: data.name,
            description: data.description,
            colorPaletteUuid: data.colorPaletteUuid,
            ...(ownerChanged ? { owner: decodeOwner(data.ownerValue) } : {}),
        });
        onConfirm?.();
    });

    return (
        <MantineModal
            title="Update Dashboard"
            {...modalProps}
            icon={IconLayoutDashboard}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isUpdating}
                    type="submit"
                    form="update-dashboard"
                >
                    Save
                </Button>
            }
        >
            <form
                id="update-dashboard"
                title="Update Dashboard"
                onSubmit={handleConfirm}
            >
                <Stack>
                    <TextInput
                        label="Name"
                        required
                        placeholder="eg. KPI Dashboards"
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        label="Description"
                        placeholder="A few words to give your team some context"
                        disabled={isUpdating}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />

                    <Select
                        label="Owner"
                        description="Who is responsible for maintaining this dashboard"
                        placeholder="No owner assigned"
                        searchable
                        clearable
                        disabled={isUpdating}
                        data={ownerOptions}
                        value={form.values.ownerValue}
                        onChange={(next) =>
                            form.setFieldValue('ownerValue', next)
                        }
                    />

                    {overrideActive && (
                        <Callout variant="info">
                            A color palette override is set in your instance
                            configuration. Dashboard-level selection is disabled
                            while the override is active.
                        </Callout>
                    )}

                    <PalettePicker
                        label="Color palette"
                        size="sm"
                        value={form.values.colorPaletteUuid}
                        onChange={(next) =>
                            form.setFieldValue('colorPaletteUuid', next)
                        }
                        palettes={palettes}
                        parentLabel={dashboard.spaceName}
                        disabled={overrideActive || isUpdating}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default DashboardUpdateModal;
