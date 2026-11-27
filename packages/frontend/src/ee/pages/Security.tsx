import { SECURITY_CONTACTS_MAX_EMAILS, validateEmail } from '@lightdash/common';
import { Button, Group, Skeleton, Stack, TagsInput } from '@mantine/core';
import {
    IconExternalLink,
    IconMail,
    IconShieldLock,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingRow } from '../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import {
    useSecurityContacts,
    useUpdateSecurityContacts,
} from '../features/securityContacts/useSecurityContacts';

const ADVISORIES_URL =
    'https://github.com/lightdash/lightdash/security/advisories';

const SecurityContactsForm: FC<{ savedEmails: string[] }> = ({
    savedEmails,
}) => {
    const [emails, setEmails] = useState(savedEmails);
    const [search, setSearch] = useState('');
    const [validationError, setValidationError] = useState<string>();
    // Text that is not an address yet goes back into the field, never away.
    const keptText = useRef<string | null>(null);
    const { mutate, isLoading: isSaving } = useUpdateSecurityContacts();

    useEffect(() => setEmails(savedEmails), [savedEmails]);

    const isDirty =
        emails.length !== savedEmails.length ||
        emails.some((email, index) => email !== savedEmails[index]);

    return (
        <SettingsCard>
            <SettingRow
                icon={IconMail}
                title="Security contacts"
                description="Lightdash emails these addresses about critical security advisories before they are published. We strongly advise using a group address such as security@yourcompany.com."
            >
                <Stack gap="sm" mt="sm">
                    <TagsInput
                        aria-label="Security contact email addresses"
                        placeholder={
                            emails.length === 0 ? 'Enter email addresses' : ''
                        }
                        value={emails}
                        error={validationError || null}
                        allowDuplicates={false}
                        maxTags={SECURITY_CONTACTS_MAX_EMAILS}
                        splitChars={[',', ' ']}
                        // Keep browser and password-manager helpers out of
                        // the field: they take focus mid-address.
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                        searchValue={search}
                        onSearchChange={(value) => {
                            // The input clears itself after every commit,
                            // before or after onChange depending on the path.
                            if (value === '' && keptText.current !== null) {
                                setSearch(keptText.current);
                                return;
                            }
                            setSearch(value);
                            if (value !== '') setValidationError(undefined);
                        }}
                        onChange={(values) => {
                            const next = values.map((value) =>
                                value.trim().toLowerCase(),
                            );
                            const invalid = next.find(
                                (value) => !validateEmail(value),
                            );
                            if (invalid !== undefined) {
                                keptText.current = invalid;
                                setSearch(invalid);
                                queueMicrotask(() => {
                                    keptText.current = null;
                                });
                            }
                            setValidationError(
                                invalid
                                    ? `'${invalid}' doesn't appear to be an email address`
                                    : undefined,
                            );
                            setEmails([...new Set(next.filter(validateEmail))]);
                        }}
                    />
                    <Group justify="flex-end">
                        <Button
                            disabled={!isDirty}
                            loading={isSaving}
                            onClick={() => mutate(emails)}
                        >
                            Save
                        </Button>
                    </Group>
                </Stack>
            </SettingRow>
        </SettingsCard>
    );
};

const SecurityContactsContent = () => {
    const { emails, isLoading, isNotConfigured } = useSecurityContacts();

    if (isLoading) return <Skeleton h={140} radius="md" />;

    if (isNotConfigured) {
        return (
            <Callout variant="info" title="Security contacts not set up">
                Security contacts are not set up for this license yet. Contact
                support.
            </Callout>
        );
    }

    if (!emails) {
        return (
            <Callout variant="warning" title="Security contacts unavailable">
                Security contacts could not be loaded right now. Try again
                later.
            </Callout>
        );
    }

    return <SecurityContactsForm savedEmails={emails} />;
};

export default function Security() {
    return (
        <SettingsPage
            title="Security"
            description="Choose who Lightdash warns about security issues, and read published advisories."
        >
            <Stack gap="md">
                <SecurityContactsContent />
                <SettingsCard>
                    <SettingRow
                        icon={IconShieldLock}
                        title="Security advisories"
                        description="Published advisories list the affected and fixed versions of Lightdash. The list opens on GitHub in a new tab."
                        control={
                            <Button
                                component="a"
                                variant="default"
                                href={ADVISORIES_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                rightSection={
                                    <MantineIcon icon={IconExternalLink} />
                                }
                            >
                                View advisories
                            </Button>
                        }
                    />
                </SettingsCard>
            </Stack>
        </SettingsPage>
    );
}
