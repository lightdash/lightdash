import { Button, Group, Paper } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

export const AddVisualizationPlaceholder: FC<{ onAdd: () => void }> = ({
    onAdd,
}) => (
    <Paper variant="dotted" p="lg">
        <Group justify="center">
            <Button
                variant="default"
                leftSection={<MantineIcon icon={IconPlus} />}
                onClick={onAdd}
            >
                Add visualization
            </Button>
        </Group>
    </Paper>
);
