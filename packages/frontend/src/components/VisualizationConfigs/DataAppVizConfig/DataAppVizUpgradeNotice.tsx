import { type DataAppVizSchemaChanges } from '@lightdash/common';
import { Button, Group, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import DataAppVizUpgradeModal from './DataAppVizUpgradeModal';

type Props = {
    typeName: string;
    changes: DataAppVizSchemaChanges;
    onUpgrade: () => void;
};

/**
 * Tells a chart editor that its project chart type moved on. The details and
 * the upgrade itself live behind the review modal, so the panel stays quiet.
 */
const DataAppVizUpgradeNotice: FC<Props> = ({
    typeName,
    changes,
    onUpgrade,
}) => {
    const [isReviewing, setIsReviewing] = useState(false);

    return (
        <>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text fz="xs" c="dimmed">
                    Newer version available
                </Text>
                <Button
                    size="compact-xs"
                    variant="light"
                    color="blue"
                    flex="0 0 auto"
                    leftSection={<MantineIcon icon={IconSparkles} size={14} />}
                    onClick={() => setIsReviewing(true)}
                >
                    Review upgrade
                </Button>
            </Group>
            {isReviewing && (
                <DataAppVizUpgradeModal
                    typeName={typeName}
                    changes={changes}
                    onClose={() => setIsReviewing(false)}
                    onUpgrade={() => {
                        onUpgrade();
                        setIsReviewing(false);
                    }}
                />
            )}
        </>
    );
};

export default DataAppVizUpgradeNotice;
