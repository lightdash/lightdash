import { Button, Select, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { type Connection, type Edge } from '@xyflow/react';
import { useState, type FC } from 'react';
import MantineModal from '../../../../components/common/MantineModal';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import classes from './Canvas.module.css';
import { type ExpandedNodeData } from './TreeComponents/nodes/ExpandedNode';

type Props = {
    nodes: ExpandedNodeData[];
    edges: Edge[];
    onConnect: (connection: Connection) => Promise<void>;
};

export const CanvasConnectionModal: FC<Props> = ({
    nodes,
    edges,
    onConnect,
}) => {
    const getUiString = useUiStrings();
    const [opened, { open, close }] = useDisclosure(false);
    const [source, setSource] = useState<string | null>(null);
    const [target, setTarget] = useState<string | null>(null);
    const options = nodes.map((node) => ({
        value: node.id,
        label: `${node.data.label} (${node.data.tableName})`,
    }));
    const connectionExists = edges.some(
        (edge) => edge.source === source && edge.target === target,
    );
    const canConnect = Boolean(
        source &&
        target &&
        source !== target &&
        nodes.some((node) => node.id === source) &&
        nodes.some((node) => node.id === target) &&
        !connectionExists,
    );

    return (
        <>
            <Button
                variant="default"
                size="xs"
                disabled={nodes.length < 2}
                onClick={() => {
                    setSource(nodes.find((node) => node.selected)?.id ?? null);
                    setTarget(null);
                    open();
                }}
            >
                {getUiString('metrics.connectMetrics')}
            </Button>
            <MantineModal
                opened={opened}
                onClose={close}
                title={getUiString('metrics.connectMetrics')}
                confirmLabel={getUiString('metrics.connect')}
                confirmDisabled={!canConnect}
                onConfirm={async () => {
                    if (!canConnect || !source || !target) return;
                    await onConnect({
                        source,
                        target,
                        sourceHandle: null,
                        targetHandle: null,
                    });
                    close();
                }}
            >
                <Stack>
                    <Select
                        label={getUiString('metrics.connectionSource')}
                        classNames={{ option: classes.connectionOption }}
                        searchable
                        data={options}
                        value={source}
                        onChange={(value) => {
                            setSource(value);
                            setTarget(null);
                        }}
                    />
                    <Select
                        label={getUiString('metrics.connectionTarget')}
                        classNames={{ option: classes.connectionOption }}
                        searchable
                        data={options.filter(
                            (option) => option.value !== source,
                        )}
                        value={target}
                        onChange={setTarget}
                        disabled={!source}
                        error={
                            connectionExists
                                ? getUiString('metrics.connectionExists')
                                : undefined
                        }
                    />
                </Stack>
            </MantineModal>
        </>
    );
};
