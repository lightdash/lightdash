/**
 * The fields of a live data source that are typed and saved together: what
 * it is (name, AI hint, tags) and how it signs in (account, region, key).
 * One form holds both, because the saved payload is built from all of them;
 * the Details and Authentication cards each edit and save their own part.
 */
import { useForm } from '@mantine/form';
import { isEqual } from 'es-toolkit/compat';
import {
    LIVE_SOURCE_UPDATE_MESSAGES,
    useUpdateExternalConnection,
} from '../hooks/useUpdateExternalConnection';
import {
    getAccountField,
    getLiveSourceAccess,
    getTokenLabel,
    toLiveSourceAccessUpdate,
    toLiveSourceAccessValues,
    type LiveSourceAccessValues,
} from './liveSourceAccess';
import { type LiveSourceConnection } from './liveSourceRows';

type TextKey = keyof LiveSourceAccessValues;
type Values = LiveSourceAccessValues & { tags: string[] };

const DETAIL_KEYS: TextKey[] = ['name', 'aiHint'];

export const useLiveSourceForm = (
    projectUuid: string,
    connection: LiveSourceConnection,
) => {
    const access = getLiveSourceAccess(connection);
    const accountField = getAccountField(access);
    const tokenLabel = getTokenLabel(access);
    const isPostHogKey = access.kind === 'posthogKey';
    /** What Authentication saves together, the new key included. */
    const authKeys: TextKey[] = [
        ...(accountField ? (['accountId'] as const) : []),
        ...(isPostHogKey ? (['region'] as const) : []),
        ...(tokenLabel ? (['token'] as const) : []),
    ];
    const update = useUpdateExternalConnection(LIVE_SOURCE_UPDATE_MESSAGES);

    const form = useForm<Values>({
        initialValues: {
            ...toLiveSourceAccessValues(connection, access),
            tags: connection.tags ?? [],
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            accountId: (value) => accountField?.validate(value) ?? null,
        },
    });

    const isChanged = (keys: TextKey[]) =>
        keys.some(
            (key) =>
                form.values[key].trim() !== form.getInitialValues()[key].trim(),
        );
    const isTagsChanged = !isEqual(
        form.values.tags,
        form.getInitialValues().tags,
    );

    const revert = (keys: TextKey[]) =>
        keys.forEach((key) => {
            form.setFieldValue(key, form.getInitialValues()[key]);
            form.clearFieldError(key);
        });

    /** A saved key is never sent to another region, so moving needs a new one. */
    const needsKeyForRegion = () => {
        if (
            !isPostHogKey ||
            form.values.region === form.getInitialValues().region ||
            form.values.token.trim() !== ''
        )
            return false;
        form.setFieldError('token', 'Enter a key for the new region');
        return true;
    };

    const validate = (keys: TextKey[]) =>
        !keys.some((key) => form.validateField(key).hasError) &&
        !(keys.includes('region') && needsKeyForRegion());

    /** Saves these fields over the saved ones; false leaves them as typed. */
    const save = async (keys: TextKey[], tags?: string[]) => {
        if (!validate(keys)) return false;
        const changed = Object.fromEntries(
            keys.map((key) => [key, form.values[key].trim()]),
        );
        const next = {
            ...form.getInitialValues(),
            ...changed,
            ...(tags ? { tags } : {}),
        };
        try {
            await update.mutateAsync({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                data: {
                    ...toLiveSourceAccessUpdate(connection, access, next),
                    ...(tags ? { tags } : {}),
                },
            });
        } catch {
            // The hook already says why; the fields keep what was typed
            return false;
        }
        form.setInitialValues({ ...next, token: '' });
        // Saving Details leaves a key typed into Authentication in place
        form.setValues(
            keys.includes('token') ? { ...changed, token: '' } : changed,
        );
        return true;
    };

    return {
        form,
        access,
        accountField,
        tokenLabel,
        isPostHogKey,
        isSaving: update.isLoading,
        details: {
            isChanged: isChanged(DETAIL_KEYS) || isTagsChanged,
            save: () =>
                save(DETAIL_KEYS, isTagsChanged ? form.values.tags : undefined),
            revert: () => {
                revert(DETAIL_KEYS);
                form.setFieldValue('tags', form.getInitialValues().tags);
            },
        },
        auth: {
            /** False for a sign-in, which has nothing typed to save. */
            hasFields: authKeys.length > 0,
            isChanged: isChanged(authKeys),
            /** As typed and as saved, for the tests to tell a change from none. */
            typed: authKeys.map((key) => form.values[key]),
            saved: authKeys.map((key) => form.getInitialValues()[key]),
            validate: () => validate(authKeys),
            save: () => save(authKeys),
            revert: () => revert(authKeys),
            /** The source as it would be saved, to test before saving. */
            toUpdate: () =>
                toLiveSourceAccessUpdate(connection, access, form.values),
        },
    };
};

export type LiveSourceForm = ReturnType<typeof useLiveSourceForm>;
