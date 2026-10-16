import { type Dimension, type Metric } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';

type Props = {
    item: Metric | Dimension;
};

const FormatMenuOptions: FC<Props> = ({ item }) => {
    const { t } = useTranslation('explorer');
    const { track } = useTracking();
    const dispatch = useExplorerDispatch();

    const onCreate = () => {
        dispatch(explorerActions.toggleFormatModal({ item }));
        track({
            name: EventName.FORMAT_METRIC_BUTTON_CLICKED,
        });
    };

    return (
        <>
            <Menu.Label>{t('columnHeaderMenu.format.title')}</Menu.Label>
            <Menu.Item onClick={onCreate}>
                {t('columnHeaderMenu.format.edit')}
            </Menu.Item>
        </>
    );
};

export default FormatMenuOptions;
