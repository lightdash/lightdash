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
} from '@mantine-8/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useProjectValidation } from '../../../../../hooks/validation/useValidation';
import styles from './ReviewValidationList.module.css';

const MAX_VISIBLE_ERRORS = 10;

type Props = {
    previewProjectUuid: string;
};

const getValidationName = (error: ValidationResponse): string =>
    error.name ?? 'Unnamed';

// Chart-configuration warnings on charts are hidden by default on the validator
// page (includeChartConfigWarnings=false); mirror that exact condition so the
// count and entries match what "See all" opens.
const isHiddenConfigWarning = (error: ValidationResponse): boolean =>
    error.source === ValidationSourceType.Chart &&
    error.errorType === ValidationErrorType.ChartConfiguration;

export const ReviewValidationList: FC<Props> = ({ previewProjectUuid }) => {
    const { data, isInitialLoading } = useProjectValidation(previewProjectUuid);
    const validatorUrl = `/generalSettings/projectManagement/${previewProjectUuid}/validator`;

    if (isInitialLoading) {
        return (
            <Group gap="xs" pt="xs">
                <Loader size={12} color="ldGray.5" />
                <Text fz="xs" c="ldGray.6">
                    Loading validation results…
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
            <Text fz="xs" c="ldGray.6" pt="xs">
                No validation errors found
            </Text>
        );
    }

    return (
        <Stack gap="xs" pt="xs">
            <Text fz="xs" fw={700} tt="uppercase" lts={0.4} c="ldGray.7">
                {total} validation {total === 1 ? 'error' : 'errors'}
            </Text>

            <List size="xs" spacing={4} c="ldGray.7">
                {errors.slice(0, MAX_VISIBLE_ERRORS).map((error) => (
                    <List.Item key={error.validationUuid}>
                        <Tooltip
                            label={error.error}
                            withArrow
                            multiline
                            maw={320}
                            openDelay={300}
                        >
                            <Text fz="xs" c="ldGray.7" lineClamp={1}>
                                <Text span inherit fw={600} c="ldGray.9">
                                    {getValidationName(error)}
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
                See more
            </UnstyledButton>
        </Stack>
    );
};
