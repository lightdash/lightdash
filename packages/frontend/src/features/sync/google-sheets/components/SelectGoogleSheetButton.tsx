import { Badge, Button, CloseButton, Tooltip } from '@mantine/core';
import { FC, useCallback } from 'react';
import useDrivePicker from 'react-google-drive-picker';
import { useFormContext } from 'react-hook-form';
import MantineIcon from '../../../../components/common/MantineIcon';
import { GsheetsIcon } from '../../../../components/SchedulerModals/SchedulerModalBase/SchedulerModalBase.styles';
import { useGdriveAccessToken } from '../../../../hooks/gdrive/useGdrive';
import useHealth from '../../../../hooks/health/useHealth';

export const SelectGoogleSheetButton: FC = () => {
    const methods = useFormContext();
    const health = useHealth();
    const [openPicker] = useDrivePicker();

    const { data: gdriveAuth, refetch } = useGdriveAccessToken();

    const googleDriveId = methods.watch('options.gdriveId');
    const googleDriveName = methods.watch('options.gdriveName');

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

            methods.setValue('options.gdriveId', doc.id);
            methods.setValue('options.gdriveName', doc.name);
            methods.setValue('options.url', doc.url);
            methods.setValue(
                'options.gdriveOrganizationName',
                doc.organizationDisplayName,
            );
        },
        [methods],
    );

    const handleOpenPicker = useCallback(
        (accessToken: string | undefined) => {
            if (
                !health.data?.auth.google.oauth2ClientId ||
                !health.data.auth.google.googleDriveApiKey
            )
                return;

            // TODO: Create hook/util to check and initiate google drive auth
            if (accessToken === undefined) {
                const gdriveUrl = `${health?.data?.siteUrl}/api/v1/login/gdrive`;
                const googleLoginPopup = window.open(
                    gdriveUrl,
                    'login-popup',
                    'width=600,height=600',
                );

                // Refetching until user logs in with google drive auth
                const refetchAuth = setInterval(() => {
                    refetch().then((r) => {
                        if (googleLoginPopup?.closed) {
                            clearInterval(refetchAuth);
                        }
                        if (r.data !== undefined) {
                            clearInterval(refetchAuth);
                            googleLoginPopup?.close();
                            handleOpenPicker(r.data);
                        }
                    });
                }, 2000);
                return false;
            }

            openPicker({
                clientId: health.data?.auth.google.oauth2ClientId,
                developerKey: health.data.auth.google.googleDriveApiKey,
                viewId: 'SPREADSHEETS',
                token: accessToken,
                showUploadView: true,
                showUploadFolders: true,
                setSelectFolderEnabled: false,
                setIncludeFolders: true,
                supportDrives: true,
                multiselect: false,
                callbackFunction: onGooglePickerSelect,
            });
        },
        [openPicker, health?.data, refetch, onGooglePickerSelect],
    );

    if (googleDriveId) {
        return (
            <Badge
                py="md"
                radius="sm"
                leftSection={<MantineIcon icon={GsheetsIcon} />}
                styles={{
                    root: {
                        color: 'black',
                        textTransform: 'none',
                        fontWeight: 450,
                    },
                    leftSection: {
                        marginRight: 8,
                    },
                }}
                size="md"
                color="green.4"
                rightSection={
                    <CloseButton
                        onClick={() => {
                            methods.setValue('options.gdriveId', '');
                            methods.setValue('options.gdriveName', '');
                            methods.setValue('options.url', '');
                            methods.setValue(
                                'options.gdriveOrganizationName',
                                '',
                            );
                        }}
                    />
                }
            >
                {googleDriveName} ({googleDriveId})
            </Badge>
        );
    }
    return (
        <Tooltip
            withinPortal
            multiline
            w={300}
            label="Please ensure you have a Google Sheet already created in your Drive to set as the destination for your results"
        >
            <Button
                size="xs"
                onClick={() => {
                    handleOpenPicker(gdriveAuth);
                }}
            >
                Select Google Sheet via Google drive
            </Button>
        </Tooltip>
    );
};
