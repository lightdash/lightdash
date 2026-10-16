import {
    ValidationErrorType,
    ValidationSourceType,
    type ValidationResponse,
} from '@lightdash/common';
import {
    Group,
    List,
    Loader,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useProjectValidation } from '../../../../../hooks/validation/useValidation';
import styles from './ReviewValidationList.module.css';

const MAX_VISIBLE_ERRORS = 10;

type Props = {
    previewProjectUuid: string;
};

// Chart-configuration warnings on charts are hidden by default on the validator
// page (includeChartConfigWarnings=false); mirror that exact condition so the
// count and entries match what "See all" opens.
const isHiddenConfigWarning = (error: ValidationResponse): boolean =>
    error.source === ValidationSourceType.Chart &&
    error.errorType === ValidationErrorType.ChartConfiguration;

export const ReviewValidationList: FC<Props> = ({ previewProjectUuid }) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const { data, isInitialLoading } = useProjectValidation(previewProjectUuid);
    const validatorUrl = `/generalSettings/projectManagement/${previewProjectUuid}/validator`;

    if (isInitialLoading) {
        return (
            <Group gap="xs" pt="xs">
                <Loader size={12} color="ldGray.5" />
                <Text fz="xs" c="dimmed">
                    {t('reviews.validation.loading')}
                </Text>
            </Group>
        );
    }

    const errors = (data ?? []).filter(
        (error) => !isHiddenConfigWarning(error),
    );
    const total = errors.length;

    if (total === 0) {
        return (
            <Text fz="xs" c="dimmed" pt="xs">
                {t('reviews.validation.none')}
            </Text>
        );
    }

    return (
        <Stack gap="xs" pt="xs">
            <Text fz="xs" fw={600} tt="uppercase" lts={0.4} c="ldGray.7">
                {t('reviews.validation.count', { count: total })}
            </Text>

            <List size="xs" spacing={4} c="ldGray.7">
                {errors.slice(0, MAX_VISIBLE_ERRORS).map((error) => (
                    <List.Item key={error.validationUuid}>
                        <Tooltip label={error.error} maw={320} openDelay={300}>
                            <Text fz="xs" c="ldGray.7" lineClamp={1}>
                                <Text span inherit fw={600}>
                                    {error.name ??
                                        t('reviews.validation.unnamed')}
                                </Text>
                                {' - '}
                                {error.error}
                            </Text>
                        </Tooltip>
                    </List.Item>
                ))}
            </List>

            <UnstyledButton
                component={Link}
                to={validatorUrl}
                className={styles.linkButton}
            >
                {t('reviews.validation.seeMore')}
            </UnstyledButton>
        </Stack>
    );
};
