import {
    Anchor,
    Box,
    CloseButton,
    Group,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconExternalLink,
    IconInfoCircle,
    IconPlus,
} from '@tabler/icons-react';
import { useCallback, useEffect, type FC } from 'react';
import useDrivePicker from 'react-google-drive-picker';
import { GSheetsIcon } from '../../../components/common/GSheetsIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../components/common/PolymorphicGroupButton';
import { useGdriveAccessToken } from '../../../hooks/gdrive/useGdrive';
import useHealth from '../../../hooks/health/useHealth';
import { useSyncModalFormContext } from './syncModalFormContext';
import classes from './SelectGoogleSheetButton.module.css';

export const SelectGoogleSheetButton: FC = () => {
    const form = useSyncModalFormContext();
    const health = useHealth();
    const [openPicker] = useDrivePicker();

    const googleDriveId = form.values.options.gdriveId;
    const googleDriveName = form.values.options.gdriveName;
    const googleDriveUrl = form.values.options.url;

    const onGooglePickerSelect = useCallback(
        (data: any) => {
            if (
                data.action === 'cancel' ||
                data.docs === undefined ||
                data.docs.length === 0
            ) {
                return;
            }
            const doc = data.docs[0];

            form.setFieldValue('options.gdriveId', doc.id);
            form.setFieldValue('options.gdriveName', doc.name);
            form.setFieldValue('options.url', doc.url);
            form.setFieldValue(
                'options.gdriveOrganizationName',
                doc.organizationDisplayName,
            );
        },
        [form],
    );

    const { mutate, token } = useGdriveAccessToken();

    useEffect(() => {
        if (
            token &&
            health.data?.auth.google.oauth2ClientId &&
            health.data.auth.google.googleDriveApiKey
        ) {
            openPicker({
                clientId: health.data.auth.google.oauth2ClientId,
                developerKey: health.data.auth.google.googleDriveApiKey,
                token,
                showUploadView: true,
                viewId: 'SPREADSHEETS',
                showUploadFolders: true,
                setSelectFolderEnabled: false,
                setIncludeFolders: true,
                supportDrives: true,
                multiselect: false,
                callbackFunction: onGooglePickerSelect,
            });
        }
        // Adding openPicker and onGooglePickerSelect to the dependency array causes an infinite loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, health.data]);

    if (googleDriveId) {
        return (
            <Box
                className={`${classes.sheetSelector} ${classes.sheetSelectorFilled}`}
            >
                <Group gap="sm" wrap="nowrap" justify="space-between" w="100%">
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={GSheetsIcon} size={16} />
                        <Text size="sm" fw={500}>
                            {googleDriveName}
                        </Text>
                        <Tooltip
                            withinPortal
                            label={googleDriveId}
                            multiline
                            style={{ wordBreak: 'break-word' }}
                        >
                            <MantineIcon
                                color="ldGray.6"
                                icon={IconInfoCircle}
                                size={'md'}
                            />
                        </Tooltip>
                    </Group>
                    <Group gap={6} wrap="nowrap">
                        <Tooltip withinPortal label="Open in Google Sheets">
                            <Anchor
                                href={googleDriveUrl}
                                target="_blank"
                                display="flex"
                                style={{ alignItems: 'center' }}
                            >
                                <MantineIcon
                                    icon={IconExternalLink}
                                    color="ldGray.8"
                                    size={16}
                                />
                            </Anchor>
                        </Tooltip>
                        <Tooltip withinPortal label="Remove">
                            <CloseButton
                                size="sm"
                                variant="subtle"
                                c="ldGray.6"
                                onClick={() => {
                                    form.setFieldValue('options.gdriveId', '');
                                    form.setFieldValue('options.gdriveName', '');
                                    form.setFieldValue('options.url', '');
                                    form.setFieldValue(
                                        'options.gdriveOrganizationName',
                                        '',
                                    );
                                }}
                            />
                        </Tooltip>
                    </Group>
                </Group>
            </Box>
        );
    }

    return (
        <Tooltip
            withinPortal
            multiline
            w={300}
            label="Please ensure you have a Google Sheet already created in your Drive to set as the destination for your results"
        >
            <PolymorphicGroupButton
                component="button"
                type="button"
                onClick={() => mutate()}
                className={`${classes.sheetSelector} ${classes.sheetSelectorEmpty}`}
                gap="sm"
                wrap="nowrap"
            >
                <MantineIcon icon={IconPlus} size="md" color="ldGray.5" />
                <Text size="sm" c="dimmed">
                    Select Google Sheet
                </Text>
            </PolymorphicGroupButton>
        </Tooltip>
    );
};

