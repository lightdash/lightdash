import { ActionIcon, Group, Stack, Title, Tooltip } from '@mantine/core';
import { IconLayoutSidebarRightCollapse } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { EditableText } from '../../../components/VisualizationConfigs/common/EditableText';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updateResultsTableFieldConfigLabel } from '../store/sqlRunnerSlice';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const RightSidebar: FC<Props> = ({ setSidebarOpen }) => {
    const dispatch = useAppDispatch();
    const resultsTableConfig = useAppSelector(
        (state) => state.sqlRunner.resultsTableConfig,
    );

    return (
        <Stack h="100vh" spacing="xs">
            <Group position="apart">
                <Title order={5} fz="sm" c="gray.6">
                    Configure Chart
                </Title>
                <Tooltip variant="xs" label="Close sidebar" position="left">
                    <ActionIcon size="xs">
                        <MantineIcon
                            icon={IconLayoutSidebarRightCollapse}
                            onClick={() => setSidebarOpen(false)}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>

            {resultsTableConfig && (
                <Stack spacing="xs">
                    {Object.keys(resultsTableConfig.columns).map(
                        (reference) => (
                            <EditableText
                                key={reference}
                                value={
                                    resultsTableConfig.columns[reference].label
                                }
                                onChange={(e) => {
                                    dispatch(
                                        updateResultsTableFieldConfigLabel({
                                            reference: reference,
                                            label: e.target.value,
                                        }),
                                    );
                                }}
                            />
                        ),
                    )}
                </Stack>
            )}
        </Stack>
    );
};
