import {
    AiProcedureRights,
    AiTransportKind,
    type AiWarehouseCapabilities,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { Group, Radio, Select, Stack, Text, TextInput } from '@mantine/core';
export const AiTransportEditor = ({
    value,
    capabilities,
    set,
}: {
    value: UpsertAiAccessPolicy;
    capabilities: AiWarehouseCapabilities;
    set: (patch: Partial<UpsertAiAccessPolicy>) => void;
}) => {
    const procedure = capabilities.transports.procedure;
    return (
        <>
            {procedure && (
                <Stack gap="sm">
                    <Radio.Group
                        label="Transport"
                        value={value.transport.kind}
                        onChange={(kind) =>
                            set({
                                transport:
                                    kind === AiTransportKind.DIRECT
                                        ? { kind: AiTransportKind.DIRECT }
                                        : {
                                              kind: AiTransportKind.PROCEDURE,
                                              name: '',
                                              rights: AiProcedureRights.RESTRICTED_CALLER,
                                          },
                            })
                        }
                    >
                        <Group mt="xs">
                            <Radio
                                value={AiTransportKind.DIRECT}
                                label="Direct"
                                disabled={
                                    !capabilities.transports.direct.available
                                }
                            />
                            <Radio
                                value={AiTransportKind.PROCEDURE}
                                label="Procedure"
                                disabled={!procedure.available}
                            />
                        </Group>
                    </Radio.Group>
                    {!procedure.available && (
                        <Text size="sm" c="dimmed">
                            {procedure.reason}
                        </Text>
                    )}
                    {!capabilities.transports.direct.available && (
                        <Text size="sm" c="dimmed">
                            {capabilities.transports.direct.reason}
                        </Text>
                    )}
                    {value.transport.kind === AiTransportKind.PROCEDURE && (
                        <>
                            <TextInput
                                label="Procedure name"
                                value={value.transport.name}
                                onChange={(event) => {
                                    if (
                                        value.transport.kind ===
                                        AiTransportKind.PROCEDURE
                                    )
                                        set({
                                            transport: {
                                                ...value.transport,
                                                name: event.currentTarget.value,
                                            },
                                        });
                                }}
                            />
                            <Select
                                label="Procedure rights"
                                value={value.transport.rights}
                                data={[
                                    {
                                        value: AiProcedureRights.RESTRICTED_CALLER,
                                        label: 'Restricted caller',
                                    },
                                    {
                                        value: AiProcedureRights.DEFINER,
                                        label: 'Definer',
                                    },
                                ]}
                                onChange={(rights) => {
                                    if (
                                        rights &&
                                        value.transport.kind ===
                                            AiTransportKind.PROCEDURE
                                    )
                                        set({
                                            transport: {
                                                ...value.transport,
                                                rights: rights as AiProcedureRights,
                                            },
                                        });
                                }}
                            />
                        </>
                    )}
                </Stack>
            )}
        </>
    );
};
