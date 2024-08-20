import {
    Anchor,
    Badge,
    Button,
    CloseButton,
    Flex,
    Tooltip,
} from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import useDrivePicker from 'react-google-drive-picker';
import { useFormContext } from 'react-hook-form';
import { GSheetsIcon } from '../../../components/common/GSheetsIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import { useGdriveAccessToken } from '../../../hooks/gdrive/useGdrive';
import useHealth from '../../../hooks/health/useHealth';

export const SelectGoogleSheetButton: FC = () => {
    const methods = useFormContext();
    const health = useHealth();
    const [openPicker] = useDrivePicker();

    const googleDriveId = methods.watch('options.gdriveId');
    const googleDriveName = methods.watch('options.gdriveName');
    const googleDriveUrl = methods.watch('options.url');

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

    const { mutate } = useGdriveAccessToken({
        onSuccess: (accessToken) => {
            if (
                !health.data?.auth.google.oauth2ClientId ||
                !health.data.auth.google.googleDriveApiKey
            )
                return;
            openPicker({
                clientId: health.data?.auth.google.oauth2ClientId,
                developerKey: health.data.auth.google.googleDriveApiKey,
                token: accessToken,
                showUploadView: true,
                viewId: 'SPREADSHEETS',
                showUploadFolders: true,
                setSelectFolderEnabled: false,
                setIncludeFolders: true,
                supportDrives: true,
                multiselect: false,
                callbackFunction: onGooglePickerSelect,
            });
        },
    });

    if (googleDriveId) {
        return (
            <Badge
                py="md"
                radius="sm"
                leftSection={<MantineIcon icon={GSheetsIcon} />}
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
                    <Flex>
                        <Anchor
                            href={googleDriveUrl}
                            target="_blank"
                            m={1}
                            mr={10}
                        >
                            <IconExternalLink size={20} />
                        </Anchor>
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
                    </Flex>
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
                    mutate();
                }}
            >
                Select Google Sheet via Google drive
            </Button>
        </Tooltip>
    );
};
