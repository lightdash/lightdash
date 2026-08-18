import { MultiSelect, Tooltip } from '@mantine/core';
import { useCallback, useMemo } from 'react';

export type RoleOption = { value: string; label: string };

/** A role set as edited in the UI: at most one system role plus custom roles. */
export type RoleSetValue<TSystemRole extends string = string> = {
    systemRole: TSystemRole | null;
    customRoleUuids: string[];
};

type Props<TSystemRole extends string> = {
    systemRoles: RoleOption[];
    customRoles: RoleOption[];
    value: RoleSetValue<TSystemRole>;
    onChange: (next: RoleSetValue<TSystemRole>) => void;
    disabled?: boolean;
    /** Shown while the set is empty (e.g. access inherited from the organization). */
    placeholder?: string;
    /** Distinguishes rows for assistive tech, e.g. "Roles for jane@acme.com". */
    ariaLabel: string;
    id?: string;
    size?: 'xs' | 'sm' | 'md';
    w?: number | string;
};

const toValues = (set: RoleSetValue): string[] => [
    ...(set.systemRole ? [set.systemRole] : []),
    ...set.customRoleUuids,
];

/**
 * Picker for a complete role set. Selecting a system role replaces any other
 * system role (roles are nested, so holding two adds nothing); custom roles
 * accumulate. Permissions are the union of every selected role.
 */
export function RoleSetMultiSelect<TSystemRole extends string>({
    systemRoles,
    customRoles,
    value,
    onChange,
    disabled,
    placeholder,
    ariaLabel,
    id,
    size = 'xs',
    w = 300,
}: Props<TSystemRole>) {
    const systemRoleValues = useMemo(
        () => new Set(systemRoles.map((role) => role.value)),
        [systemRoles],
    );

    const data = useMemo(() => {
        const groups: { group: string; items: RoleOption[] }[] = [];
        if (systemRoles.length > 0) {
            groups.push({ group: 'System role', items: systemRoles });
        }
        if (customRoles.length > 0) {
            groups.push({
                group: 'Custom roles (additive)',
                items: customRoles,
            });
        }
        return groups;
    }, [systemRoles, customRoles]);

    const handleChange = useCallback(
        (selected: string[]) => {
            const current = toValues(value);
            const added = selected.find((v) => !current.includes(v));
            let systemRole = value.systemRole;
            let customRoleUuids = value.customRoleUuids;
            if (added !== undefined) {
                if (systemRoleValues.has(added)) {
                    systemRole = added as TSystemRole;
                } else {
                    customRoleUuids = [...customRoleUuids, added];
                }
            } else {
                // removal
                systemRole =
                    systemRole && selected.includes(systemRole)
                        ? systemRole
                        : null;
                customRoleUuids = customRoleUuids.filter((uuid) =>
                    selected.includes(uuid),
                );
            }
            const next = { systemRole, customRoleUuids };
            if (toValues(next).length === 0) {
                return; // a set must keep at least one role
            }
            onChange(next);
        },
        [value, systemRoleValues, onChange],
    );

    return (
        <Tooltip
            label="Permissions are the union of every selected role. One system role at most; custom roles add on top."
            openDelay={500}
            withinPortal
        >
            <MultiSelect
                id={id}
                size={size}
                w={w}
                data={data}
                value={toValues(value)}
                onChange={handleChange}
                disabled={disabled}
                placeholder={
                    toValues(value).length === 0 ? placeholder : undefined
                }
                searchable
                hidePickedOptions
                comboboxProps={{ withinPortal: true }}
                aria-label={ariaLabel}
            />
        </Tooltip>
    );
}
