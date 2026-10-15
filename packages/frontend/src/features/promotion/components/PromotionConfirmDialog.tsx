import {
    PromotionAction,
    type PromotedChart,
    type PromotionChanges,
} from '@lightdash/common';
import { Accordion, Button, Flex, Loader, Stack, Text } from '@mantine/core';
import {
    IconAppWindow,
    IconChartAreaLine,
    IconDatabase,
    IconFileText,
    IconFolder,
    IconLayoutDashboard,
    IconRocket,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';

type Props = Pick<MantineModalProps, 'onClose'> & {
    type: 'chart' | 'dashboard' | 'document';
    resourceName: string;
    promotionChanges: PromotionChanges | undefined;
    onConfirm: () => void;
    onClose: () => void;
};

type PromotionChange = {
    action: PromotionAction;
    data: Pick<PromotedChart, 'name' | 'uuid'>;
};

const PromotionChangesAccordion: FC<{
    type:
        | 'spaces'
        | 'charts'
        | 'dashboards'
        | 'sqlCharts'
        | 'dataApps'
        | 'documents';
    items: {
        created: PromotionChange[];
        updated: PromotionChange[];
        deleted: PromotionChange[];
    };
}> = ({ type, items }) => {
    const { t } = useTranslation('app');
    return (
        <Accordion variant="contained">
            {items.created.length > 0 && (
                <Accordion.Item key={`${type}-created`} value={'created'}>
                    <Accordion.Control>
                        <Text size="sm">
                            {t('promotion.toBeCreated', {
                                count: items.created.length,
                            })}
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
                            {t('promotion.toBeUpdated', {
                                count: items.updated.length,
                            })}
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
                        <Text size="sm">
                            {t('promotion.deleted', {
                                count: items.deleted.length,
                            })}
                        </Text>
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
    const { t } = useTranslation('app');
    const { groupedChanges, totalChanges, withoutChanges } = useMemo(() => {
        if (promotionChanges === undefined) return {};
        const changes = {
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
            sqlCharts: {
                total: (promotionChanges.sqlCharts ?? []).filter(
                    (item) => item.action !== PromotionAction.NO_CHANGES,
                ).length,
                created: (promotionChanges.sqlCharts ?? []).filter(
                    (item) => item.action === PromotionAction.CREATE,
                ),
                updated: (promotionChanges.sqlCharts ?? []).filter(
                    (item) => item.action === PromotionAction.UPDATE,
                ),
                deleted: (promotionChanges.sqlCharts ?? []).filter(
                    (item) => item.action === PromotionAction.DELETE,
                ),
            },
            dataApps: {
                total: (promotionChanges.dataApps ?? []).filter(
                    (item) => item.action !== PromotionAction.NO_CHANGES,
                ).length,
                created: (promotionChanges.dataApps ?? []).filter(
                    (item) => item.action === PromotionAction.CREATE,
                ),
                updated: (promotionChanges.dataApps ?? []).filter(
                    (item) => item.action === PromotionAction.UPDATE,
                ),
                deleted: (promotionChanges.dataApps ?? []).filter(
                    (item) => item.action === PromotionAction.DELETE,
                ),
            },
            documents: {
                total: (promotionChanges.documents ?? []).filter(
                    (item) => item.action !== PromotionAction.NO_CHANGES,
                ).length,
                created: (promotionChanges.documents ?? []).filter(
                    (item) => item.action === PromotionAction.CREATE,
                ),
                updated: (promotionChanges.documents ?? []).filter(
                    (item) => item.action === PromotionAction.UPDATE,
                ),
                deleted: (promotionChanges.documents ?? []).filter(
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
        const totalChangesNum =
            changes.spaces.total +
            changes.charts.total +
            changes.sqlCharts.total +
            changes.dataApps.total +
            changes.documents.total +
            changes.dashboards.total;
        const withoutChangesNum =
            promotionChanges.spaces.filter(
                (item) => item.action === PromotionAction.NO_CHANGES,
            ).length +
            promotionChanges.dashboards.filter(
                (item) => item.action === PromotionAction.NO_CHANGES,
            ).length +
            promotionChanges.charts.filter(
                (item) => item.action === PromotionAction.NO_CHANGES,
            ).length +
            (promotionChanges.sqlCharts ?? []).filter(
                (item) => item.action === PromotionAction.NO_CHANGES,
            ).length +
            (promotionChanges.dataApps ?? []).filter(
                (item) => item.action === PromotionAction.NO_CHANGES,
            ).length +
            (promotionChanges.documents ?? []).filter(
                (item) => item.action === PromotionAction.NO_CHANGES,
            ).length;

        return {
            groupedChanges: changes,
            totalChanges: totalChangesNum,
            withoutChanges: withoutChangesNum,
        };
    }, [promotionChanges]);

    return (
        <MantineModal
            opened
            onClose={onClose}
            role="alertdialog"
            title={t(`promotion.promoting.${type}`)}
            icon={IconRocket}
            size="lg"
            actions={
                <Button
                    color="green"
                    disabled={totalChanges === 0}
                    onClick={() => {
                        onConfirm();
                        onClose();
                    }}
                >
                    {t('promotion.promote')}
                </Button>
            }
            description={t(`promotion.aboutToPromote.${type}`, {
                name: resourceName,
            })}
        >
            <Stack>
                {groupedChanges === undefined ? (
                    <Flex gap="sm" align="center">
                        <Loader color="gray" size={'sm'} />
                        <Text>{t('promotion.loadingDifferences')}</Text>
                    </Flex>
                ) : (
                    <Stack>
                        {groupedChanges.spaces.total > 0 && (
                            <>
                                <Text fz="sm">
                                    {t('promotion.changesApplied')}
                                </Text>
                                <Flex gap="xs" align="center">
                                    <MantineIcon
                                        icon={IconFolder}
                                        color="violet.8"
                                    />
                                    <Text fw={600}>
                                        {t('promotion.sections.spaces')}
                                    </Text>
                                </Flex>
                                <PromotionChangesAccordion
                                    type="spaces"
                                    items={groupedChanges.spaces}
                                />
                            </>
                        )}

                        {groupedChanges.dashboards.total > 0 && (
                            <>
                                <Text fz="sm">
                                    {t('promotion.changesApplied')}
                                </Text>
                                <Flex gap="xs" align="center">
                                    <MantineIcon
                                        icon={IconLayoutDashboard}
                                        color="green.8"
                                    />
                                    <Text fw={600}>
                                        {t('promotion.sections.dashboards')}
                                    </Text>
                                </Flex>
                                <PromotionChangesAccordion
                                    type="dashboards"
                                    items={groupedChanges.dashboards}
                                />
                            </>
                        )}
                        {groupedChanges.documents.total > 0 && (
                            <>
                                <Text fz="sm">
                                    {t('promotion.changesApplied')}
                                </Text>
                                <Flex gap="xs" align="center">
                                    <MantineIcon
                                        icon={IconFileText}
                                        color="indigo.7"
                                    />
                                    <Text fw={600}>
                                        {t('promotion.sections.documents')}
                                    </Text>
                                </Flex>
                                <PromotionChangesAccordion
                                    type="documents"
                                    items={groupedChanges.documents}
                                />
                            </>
                        )}
                        {groupedChanges.charts.total > 0 && (
                            <>
                                <Text fz="sm">
                                    {t('promotion.changesApplied')}
                                </Text>
                                <Flex gap="xs" align="center">
                                    <MantineIcon
                                        icon={IconChartAreaLine}
                                        color="blue.7"
                                    />
                                    <Text fw={600}>
                                        {t('promotion.sections.charts')}
                                    </Text>
                                </Flex>
                                <PromotionChangesAccordion
                                    type="charts"
                                    items={groupedChanges.charts}
                                />
                            </>
                        )}
                        {groupedChanges.sqlCharts.total > 0 && (
                            <>
                                <Text fz="sm">
                                    {t('promotion.changesApplied')}
                                </Text>
                                <Flex gap="xs" align="center">
                                    <MantineIcon
                                        icon={IconDatabase}
                                        color="cyan.7"
                                    />
                                    <Text fw={600}>
                                        {t('promotion.sections.sqlCharts')}
                                    </Text>
                                </Flex>
                                <PromotionChangesAccordion
                                    type="sqlCharts"
                                    items={groupedChanges.sqlCharts}
                                />
                            </>
                        )}
                        {groupedChanges.dataApps.total > 0 && (
                            <>
                                <Text fz="sm">
                                    {t('promotion.changesApplied')}
                                </Text>
                                <Flex gap="xs" align="center">
                                    <MantineIcon
                                        icon={IconAppWindow}
                                        color="orange.6"
                                    />
                                    <Text fw={600}>
                                        {t('promotion.sections.dataApps')}
                                    </Text>
                                </Flex>
                                <PromotionChangesAccordion
                                    type="dataApps"
                                    items={groupedChanges.dataApps}
                                />
                            </>
                        )}

                        {totalChanges === 0 && (
                            <Callout
                                variant="info"
                                title={t('promotion.noChanges')}
                            />
                        )}
                        {totalChanges !== 0 && withoutChanges > 0 && (
                            <Callout variant="info">
                                {t('promotion.onlyRecent')}
                            </Callout>
                        )}
                    </Stack>
                )}
            </Stack>
        </MantineModal>
    );
};
