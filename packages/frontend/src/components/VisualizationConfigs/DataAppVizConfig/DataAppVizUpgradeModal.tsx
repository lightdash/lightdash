import {
    hasDataAppVizSchemaChanges,
    type DataAppVizSchemaChanges,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
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
    const removesSomething =
        changes.fields.removed.length > 0 ||
        changes.configOptions.removed.length > 0;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Upgrade chart type"
            subtitle={typeName}
            icon={IconSparkles}
            size="md"
            confirmLabel="Upgrade"
            onConfirm={onUpgrade}
        >
            <Stack gap="md">
                <Text fz="sm">
                    Only this chart moves to the latest version. Nothing is
                    saved until you save the chart.
                </Text>
                {removesSomething && (
                    <Callout variant="warning">
                        Removed fields lose their mapping and removed options
                        lose their values.
                    </Callout>
                )}
                {hasDataAppVizSchemaChanges(changes) ? (
                    <VizSchemaChangesList changes={changes} />
                ) : (
                    <Text fz="sm" c="dimmed">
                        Same fields and options; only the rendering changed.
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};

export default DataAppVizUpgradeModal;
