import { Select, Stack, TextInput } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../components/common/MantineModal';
import { useCreateMutation } from '../../hooks/useSavedQuery';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import type { QueryEvent } from './hooks/useAppSdkBridge';
import { trackedQueryToCreateChart } from './utils/trackedQueryToChart';

type Props = {
    query: QueryEvent;
    projectUuid: string;
    onClose: () => void;
};

/**
 * Saves a tracked app query as a governed Lightdash table chart. Lives in the
 * Query Inspector (host chrome) — the sandboxed app never sees it. Reuses the
 * standard create-chart mutation, which shows the success toast + "View chart"
 * action and surfaces permission errors, so this modal only collects a name +
 * target space.
 */
const SaveQueryToLightdashModal: FC<Props> = ({
    query,
    projectUuid,
    onClose,
}) => {
    const { t } = useTranslation('apps');
    const { data: spaces, isLoading: spacesLoading } =
        useSpaceSummaries(projectUuid);
    const createChart = useCreateMutation({
        redirectOnSuccess: false,
        projectUuid,
    });

    const [name, setName] = useState(
        query.label || query.exploreName || t('saveQuery.untitled'),
    );
    const [spaceUuid, setSpaceUuid] = useState<string | null>(null);

    const spaceOptions = useMemo(
        () => (spaces ?? []).map((s) => ({ value: s.uuid, label: s.name })),
        [spaces],
    );
    // Derived (not synced state): default to the first accessible space until
    // the user picks one.
    const selectedSpace = spaceUuid ?? spaceOptions[0]?.value ?? null;

    const handleSave = () => {
        if (!name.trim()) return;
        const payload = trackedQueryToCreateChart(query, {
            name: name.trim(),
            spaceUuid: selectedSpace ?? undefined,
        });
        if (!payload) return;
        createChart.mutate(payload, {
            // The hook's own onSuccess shows the toast + "View chart" action;
            // this per-call handler just closes the modal.
            onSuccess: () => onClose(),
        });
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={t('queryInspector.saveToLightdash')}
            icon={IconDeviceFloppy}
            size="sm"
            onConfirm={handleSave}
            confirmLabel={t('actions.save', { ns: 'common' })}
            confirmLoading={createChart.isLoading}
            confirmDisabled={!name.trim() || !selectedSpace}
        >
            <Stack gap="sm">
                <TextInput
                    label={t('saveQuery.nameLabel')}
                    placeholder={t('saveQuery.namePlaceholder')}
                    required
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    data-autofocus
                />
                <Select
                    label={t('info.space')}
                    placeholder={
                        spacesLoading
                            ? t('saveQuery.loadingSpaces')
                            : t('saveQuery.selectSpace')
                    }
                    data={spaceOptions}
                    value={selectedSpace}
                    onChange={setSpaceUuid}
                    disabled={spacesLoading}
                    searchable
                    nothingFoundMessage={t('saveQuery.noSpaces')}
                />
            </Stack>
        </MantineModal>
    );
};

export default SaveQueryToLightdashModal;
