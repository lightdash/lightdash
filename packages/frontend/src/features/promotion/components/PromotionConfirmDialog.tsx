import {
    PromotionAction,
    type PromotedChart,
    type PromotionChanges,
} from '@lightdash/common';
import {
    Accordion,
    Button,
    Flex,
    Group,
    Modal,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useMemo, type FC } from 'react';

import {
    IconChartAreaLine,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    type: 'chart' | 'dashboard';
    resourceName: string;
    promotionChanges: PromotionChanges;
    onConfirm: () => void;
    onClose: () => void;
};

type PromotionChange = {
    action: PromotionAction;
    data: Pick<PromotedChart, 'name' | 'uuid'>;
};
const PromotionChangesAccordion: FC<{
    type: 'spaces' | 'charts' | 'dashboards';
    items: {
        created: PromotionChange[];
        updated: PromotionChange[];
        deleted: PromotionChange[];
    };
}> = ({ type, items }) => {
    return (
        <Accordion variant="contained">
            {items.created.length > 0 && (
                <Accordion.Item key={`${type}-created`} value={'created'}>
                    <Accordion.Control>
                        <Text size="sm">
                            To be created ({items.created.length})
                        </Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <ul>
                            {items.created.map((item) => {
                                return (
                                    <li key={item.data.uuid}>
                                        {item.data.name}
                                    </li>
                                );
                            })}
                        </ul>
                    </Accordion.Panel>
                </Accordion.Item>
            )}
            {items.updated.length > 0 && (
                <Accordion.Item key={`${type}-updated`} value={'updated'}>
                    <Accordion.Control>
                        <Text size="sm">
                            To be updated ({items.updated.length})
                        </Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <ul>
                            {items.updated.map((item) => {
                                return (
                                    <li key={item.data.uuid}>
                                        {item.data.name}
                                    </li>
                                );
                            })}
                        </ul>
                    </Accordion.Panel>
                </Accordion.Item>
            )}
            {items.deleted.length > 0 && (
                <Accordion.Item key={`${type}-deleted`} value={'deleted'}>
                    <Accordion.Control>
                        <Text size="sm">Deleted {items.deleted.length}</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <ul>
                            {items.deleted.map((item) => {
                                return (
                                    <li key={item.data.uuid}>
                                        {item.data.name}
                                    </li>
                                );
                            })}
                        </ul>
                    </Accordion.Panel>
                </Accordion.Item>
            )}
        </Accordion>
    );
};
export const PromotionConfirmDialog: FC<Props> = ({
    type,
    resourceName,
    promotionChanges,
    onConfirm,
    onClose,
}) => {
    const groupedChanges = useMemo(() => {
        return {
            spaces: {
                total: promotionChanges.spaces.filter(
                    (item) => item.action !== PromotionAction.NO_CHANGES,
                ).length,
                created: promotionChanges.spaces.filter(
                    (item) => item.action === PromotionAction.CREATE,
                ),
                updated: promotionChanges.spaces.filter(
                    (item) => item.action === PromotionAction.UPDATE,
                ),
                deleted: promotionChanges.spaces.filter(
                    (item) => item.action === PromotionAction.DELETE,
                ),
            },
            charts: {
                total: promotionChanges.charts.filter(
                    (item) => item.action !== PromotionAction.NO_CHANGES,
                ).length,
                created: promotionChanges.charts.filter(
                    (item) => item.action === PromotionAction.CREATE,
                ),
                updated: promotionChanges.charts.filter(
                    (item) => item.action === PromotionAction.UPDATE,
                ),
                deleted: promotionChanges.charts.filter(
                    (item) => item.action === PromotionAction.DELETE,
                ),
            },
            dashboards: {
                total: promotionChanges.dashboards.filter(
                    (item) => item.action !== PromotionAction.NO_CHANGES,
                ).length,

                created: promotionChanges.dashboards.filter(
                    (item) => item.action === PromotionAction.CREATE,
                ),
                updated: promotionChanges.dashboards.filter(
                    (item) => item.action === PromotionAction.UPDATE,
                ),
                deleted: promotionChanges.dashboards.filter(
                    (item) => item.action === PromotionAction.DELETE,
                ),
            },
        };
    }, [promotionChanges]);
    return (
        <Modal
            size="lg"
            title={<Title order={4}>Promoting {type}</Title>}
            opened={true}
            onClose={onClose}
        >
            <Stack spacing="lg" pt="sm">
                <Text>
                    Are you sure you want to promote this {type}{' '}
                    <Text span fw={600}>
                        {resourceName}
                    </Text>
                    ?
                </Text>
                These changes will be applied:
                <Stack>
                    {groupedChanges.spaces.total > 0 && (
                        <>
                            <Flex>
                                <MantineIcon
                                    icon={IconFolder}
                                    color="violet.8"
                                />{' '}
                                <Text ml={10} fw={600}>
                                    Spaces:{' '}
                                </Text>{' '}
                            </Flex>
                            <PromotionChangesAccordion
                                type="spaces"
                                items={groupedChanges.spaces}
                            />
                        </>
                    )}

                    {groupedChanges.dashboards.total > 0 && (
                        <>
                            <Flex>
                                <MantineIcon
                                    icon={IconLayoutDashboard}
                                    color="green.8"
                                />{' '}
                                <Text ml={10} fw={600}>
                                    Dashboards:{' '}
                                </Text>{' '}
                            </Flex>
                            <PromotionChangesAccordion
                                type="dashboards"
                                items={groupedChanges.dashboards}
                            />
                        </>
                    )}
                    {groupedChanges.charts.total > 0 && (
                        <>
                            <Flex>
                                <MantineIcon
                                    icon={IconChartAreaLine}
                                    color="blue.7"
                                />{' '}
                                <Text ml={10} fw={600}>
                                    Charts:{' '}
                                </Text>{' '}
                            </Flex>
                            <PromotionChangesAccordion
                                type="charts"
                                items={groupedChanges.charts}
                            />
                        </>
                    )}
                </Stack>
                <Group position="right" mt="sm">
                    <Button color="dark" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>

                    <Button color="red" onClick={onConfirm}>
                        Promote
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
