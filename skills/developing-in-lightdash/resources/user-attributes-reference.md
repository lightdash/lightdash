# User Attributes Reference

User attributes let you customize queries, row-level security, and access control based on the logged-in user. They are defined org-wide by admins and assigned per user or group.

## SQL Variables

Reference user attributes inside `sql_filter` and `sql_on` using template syntax.

### Custom Attributes

```
${lightdash.attributes.<attribute_name>}
```

Shorthand aliases are supported:
- `ld` for `lightdash`
- `attribute` or `attr` for `attributes`

```
${ld.attr.sales_region}        # equivalent to ${lightdash.attributes.sales_region}
```

### Intrinsic Attributes

```
${lightdash.user.email}        # the logged-in user's verified email
```

Only `email` is available. It requires a verified email address — unverified emails produce a Forbidden error.

### Automatic Quoting

**Values are automatically single-quoted when interpolated.** Do not add your own quotes around the reference.

If a user has `sales_region` set to `US` (or multiple values `US`, `EU` from user + group assignments), the replacement is:

```
${lightdash.attributes.sales_region}  -->  'US','EU'
```

| Pattern | Result | Correct? |
|---------|--------|----------|
| `IN (${lightdash.attributes.region})` | `IN ('US','EU')` | Yes |
| `IN ('${lightdash.attributes.region}')` | `IN (''US','EU'')` | No — double-quoted |
| `= ${lightdash.attributes.region}` | `= 'US','EU'` | Risky — breaks if multiple values. Use `IN` |

### Where SQL Variables Work

| Context | Supported | Security boundary? |
|---------|-----------|---------------------|
| `sql_filter` (model-level) | Yes | Yes — enforced at warehouse level |
| `sql_on` (join filtering) | Yes | Yes — enforced at warehouse level |
| Chart/dashboard filter values | Yes | No — users with edit access can remove filters |
| `sql:` on dimensions/metrics | No | N/A |

## Row Filtering with sql_filter

Use `sql_filter` with user attributes for row-level security (RLS). Use `IN` since a user may have multiple values (from user + group assignments).

**dbt (v1.9 and earlier):**
```yaml
models:
  - name: orders
    meta:
      sql_filter: ${TABLE}.sales_region IN (${lightdash.attributes.sales_region})
```

**dbt (v1.10+ / Fusion):**
```yaml
models:
  - name: orders
    config:
      meta:
        sql_filter: ${TABLE}.sales_region IN (${lightdash.attributes.sales_region})
```

**Pure Lightdash YAML:**
```yaml
type: model
name: orders

sql_filter: ${TABLE}.sales_region IN (${lightdash.attributes.sales_region})
```

Filter by email:

```yaml
# dbt v1.9
meta:
  sql_filter: ${TABLE}.owner_email = ${lightdash.user.email}
```

## Join Filtering with sql_on

Restrict rows returned from joined tables:

**dbt (v1.9 and earlier):**
```yaml
meta:
  joins:
    - join: joined_table
      sql_on: >
        ${base}.id = ${joined_table}.id
        AND ${joined_table}.region = ${lightdash.attributes.region}
```

**Pure Lightdash YAML:**
```yaml
joins:
  - join: joined_table
    sql_on: >
      ${base}.id = ${joined_table}.id
      AND ${joined_table}.region = ${lightdash.attributes.region}
```

## Access Control with required_attributes and any_attributes

Hide tables, dimensions, or metrics from users who lack the required attribute values. These do **not** use SQL variables — they use a declarative key-value matching syntax.

### required_attributes (AND logic)

All conditions must match. The user must have every listed attribute with a matching value.

**On a table:**
```yaml
# dbt v1.9
meta:
  required_attributes:
    department: "sales"                  # user must have department = "sales"
    is_admin: "true"                     # AND is_admin = "true"
```

**On a dimension:**
```yaml
# dbt v1.9
columns:
  - name: salary
    meta:
      dimension:
        required_attributes:
          is_admin: "true"
```

**On a metric:**
```yaml
# dbt v1.9
meta:
  metrics:
    confidential_revenue:
      type: sum
      required_attributes:
        role: "finance"
```

Multiple values on a single key use OR within that key:

```yaml
required_attributes:
  team_name: ["HR", "C-Suite"]           # team_name = "HR" OR "C-Suite"
```

### any_attributes (OR logic)

At least one condition must match:

```yaml
# dbt v1.9
columns:
  - name: revenue
    meta:
      dimension:
        any_attributes:
          department: ["sales", "finance"]   # department matches OR...
          role: "analyst"                     # ...role matches
```

### Combining Both

When both are set, both checks must pass:

```yaml
# user must have access_level = "2" AND (department = "sales" OR "finance")
required_attributes:
  access_level: "2"
any_attributes:
  department: ["sales", "finance"]
```

### Access Control Notes

- Hidden dimensions also hide any metrics derived from them
- Querying a hidden dimension returns a Forbidden error
- `required_attributes` and `any_attributes` do **not** support intrinsic attributes (`email`)
- Values are always strings — use `"true"` not `true`

## User and Group Attribute Interaction

Users can have attribute values from direct assignment and from group membership. All values are combined:

- **Row filtering (`sql_filter`)**: The template is replaced with all values comma-separated — e.g., `'kiwi','orange','coconut'`
- **Access control (`required_attributes` / `any_attributes`)**: If any of the combined values match, the user has access

## Limitations

- SQL Runner queries and custom SQL in table calculations can bypass `sql_filter` — they are not a full security boundary for users with developer/admin access
- Scheduled deliveries run as the user who created them — attribute-based filtering reflects that user's attributes
- User attributes are text-only (not dates or numbers)
- `sql:` tags on dimensions and metrics do **not** support user attribute references
