import { type Dashboard } from '@lightdash/common';
import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';
import useHealth from '../../../hooks/health/useHealth';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import Callout from '../Callout';
import MantineModal from '../MantineModal';
import { PalettePicker } from '../PalettePicker/PalettePicker';
import { UserSelect } from '../UserSelect';

interface DashboardUpdateModalProps {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<Dashboard, 'name' | 'description'> & {
    colorPaletteUuid: string | null;
    ownerUserUuid: string | null;
};

const DashboardUpdateModal: FC<DashboardUpdateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation('modals');
    const projectUuid = useProjectUuid();
    const { data: dashboard, isInitialLoading } = useDashboardQuery({
        uuidOrSlug: uuid,
        projectUuid,
        // Prefill from the author's own draft, so saving the form doesn't
        // revert a drafted name back to the published one.
        includeUnpublishedDraft: true,
    });
    const { data: palettes = [] } = useColorPalettes();
    const { data: health } = useHealth();
    const { mutateAsync, isLoading: isUpdating } = useUpdateDashboard(
        uuid,
        projectUuid,
    );

    const form = useForm<FormState>({
        initialValues: {
            name: '',
            description: '',
            colorPaletteUuid: null,
            ownerUserUuid: null,
        },
    });

    const { setValues } = form;

    useEffect(() => {
        if (!dashboard) return;

        setValues({
            name: dashboard.name,
            description: dashboard.description ?? '',
            colorPaletteUuid: dashboard.colorPaletteUuid ?? null,
            ownerUserUuid: dashboard.owner?.userUuid ?? null,
        });
    }, [dashboard, setValues]);

    if (isInitialLoading || !dashboard) {
        return null;
    }

    const overrideActive =
        !!health?.appearance.overrideColorPalette &&
        health.appearance.overrideColorPalette.length > 0;

    const handleConfirm = form.onSubmit(async (data) => {
        await mutateAsync({
            name: data.name,
            description: data.description,
            colorPaletteUuid: data.colorPaletteUuid,
            ownerUserUuid: data.ownerUserUuid,
        });
        onConfirm?.();
    });

    return (
        <MantineModal
            title={t('dashboardUpdate.title')}
            {...modalProps}
            icon={IconLayoutDashboard}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isUpdating}
                    type="submit"
                    form="update-dashboard"
                >
                    {t('actions.save', { ns: 'common' })}
                </Button>
            }
        >
            <form
                id="update-dashboard"
                title={t('dashboardUpdate.title')}
                onSubmit={handleConfirm}
            >
                <Stack>
                    <TextInput
                        label={t('dashboardUpdate.nameLabel')}
                        required
                        placeholder={t('dashboardForm.namePlaceholder')}
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        label={t('dashboardForm.descriptionLabel')}
                        placeholder={t('descriptionPlaceholder')}
                        disabled={isUpdating}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />

                    <UserSelect
                        label={t('dashboardUpdate.ownerLabel')}
                        placeholder={t('dashboardUpdate.ownerPlaceholder')}
                        value={form.values.ownerUserUuid}
                        onChange={(next) =>
                            form.setFieldValue('ownerUserUuid', next)
                        }
                        disabled={isUpdating}
                        clearable
                    />

                    {overrideActive && (
                        <Callout variant="info">
                            {t('dashboardUpdate.paletteOverrideActive')}
                        </Callout>
                    )}

                    <PalettePicker
                        label={t('dashboardUpdate.colorPalette')}
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
