import {
    hasDataAppVizSchemaChanges,
    type DataAppVizSchemaChanges,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import VizSchemaChangesList from '../../../features/chartTypes/components/VizSchemaChangesList';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';

type Props = {
    typeName: string;
    /** What the latest version declares that the pinned one did not. */
    changes: DataAppVizSchemaChanges;
    onClose: () => void;
    onUpgrade: () => void;
};

/**
 * What moving this chart to the latest version of its type would change.
 */
const DataAppVizUpgradeModal: FC<Props> = ({
    typeName,
    changes,
    onClose,
    onUpgrade,
}) => {
    const { t } = useTranslation('vizConfig');
    const removesSomething =
        changes.fields.removed.length > 0 ||
        changes.configOptions.removed.length > 0;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={t('dataAppViz.upgradeModal.title')}
            subtitle={typeName}
            icon={IconSparkles}
            size="md"
            confirmLabel={t('dataAppViz.upgradeModal.confirm')}
            onConfirm={onUpgrade}
        >
            <Stack gap="md">
                <Text fz="sm">
                    {t('dataAppViz.upgradeModal.onlyThisChart')}
                </Text>
                {removesSomething && (
                    <Callout variant="warning">
                        {t('dataAppViz.upgradeModal.removedWarning')}
                    </Callout>
                )}
                {hasDataAppVizSchemaChanges(changes) ? (
                    <VizSchemaChangesList changes={changes} />
                ) : (
                    <Text fz="sm" c="dimmed">
                        {t('dataAppViz.upgradeModal.onlyRenderingChanged')}
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};

export default DataAppVizUpgradeModal;
