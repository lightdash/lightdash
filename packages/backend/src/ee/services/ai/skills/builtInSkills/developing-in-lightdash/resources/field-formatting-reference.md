---
name: field-formatting-reference
description: Chart-level field formatting for Lightdash content editing.
---

# Field Formatting Reference

Use chart-level overrides when one saved chart needs different formatting from the field's default.

## Formatting Overrides

Chart uses `formatOptions` for metric and dimension overrides.

```json
{
    "metricQuery": {
        "metricOverrides": {
            "orders_total_revenue": {
                "formatOptions": {
                    "round": 0,
                    "separator": "default",
                    "type": "number"
                }
            }
        }
    }
}
```

Use this shape for big numbers, tables, cartesian axes/tooltips, and any saved chart where a field should be formatted differently from its default definition.

## FormatOptions Shape

```json
{
    "formatOptions": {
        "type": "number",
        "round": 0,
        "separator": "default"
    }
}
```

Common `type` values:

| Type       | Use                                        |
| ---------- | ------------------------------------------ |
| `number`   | Plain numbers                              |
| `currency` | Currency values; include `currency`        |
| `percent`  | Percent values                             |
| `default`  | Default field formatting                   |
| `custom`   | Custom format expression; include `custom` |

Useful properties:

| Property            | Use                                                          |
| ------------------- | ------------------------------------------------------------ |
| `round`             | Decimal places                                               |
| `separator`         | Number separator style; use `default` unless asked otherwise |
| `currency`          | Currency code for `type: currency`                           |
| `compact`           | Compact display such as `K`, `M`, `B`, `T`                   |
| `prefix` / `suffix` | Add units or labels                                          |
| `custom`            | Custom format expression for `type: custom`                  |

## Spreadsheet-Style Custom Formats

Use `type: custom` with `custom` for spreadsheet-style format expressions when presets are not enough.

Common expression patterns:

| Goal                         | Custom expression   | Example output |
| ---------------------------- | ------------------- | -------------- |
| Two decimals                 | `#,##0.00`          | `1,234.57`     |
| No decimals                  | `#,##0`             | `1,235`        |
| Percent with two decimals    | `#,##0.00%`         | `67.58%`       |
| Currency with two decimals   | `[$$]#,##0.00`      | `$1,234.57`    |
| Compact currency in millions | `[$$]#,##0.00,,"M"` | `$13.33M`      |

```json
{
    "metricQuery": {
        "metricOverrides": {
            "orders_total_revenue": {
                "formatOptions": {
                    "custom": "[$$]#,##0.00,,\"M\"",
                    "type": "custom"
                }
            }
        }
    }
}
```

## Compact Values

Use `compact` with number, currency, or byte formatting to scale large values.

| Value                     | Aliases         | Example output |
| ------------------------- | --------------- | -------------- |
| `thousands`               | `K`, `thousand` | `1K`           |
| `millions`                | `M`, `million`  | `1M`           |
| `billions`                | `B`, `billion`  | `1B`           |
| `trillions`               | `T`, `trillion` | `1T`           |
| `kilobytes` / `kibibytes` | `KB` / `KiB`    | `1KB` / `1KiB` |
| `megabytes` / `mebibytes` | `MB` / `MiB`    | `1MB` / `1MiB` |
| `gigabytes` / `gibibytes` | `GB` / `GiB`    | `1GB` / `1GiB` |

## Examples

No decimal places:

```json
{
    "metricQuery": {
        "metricOverrides": {
            "orders_average_order_size": {
                "formatOptions": {
                    "round": 0,
                    "separator": "default",
                    "type": "number"
                }
            }
        }
    }
}
```

Currency with no decimal places:

```json
{
    "metricQuery": {
        "metricOverrides": {
            "orders_total_revenue": {
                "formatOptions": {
                    "currency": "USD",
                    "round": 0,
                    "separator": "default",
                    "type": "currency"
                }
            }
        }
    }
}
```

Compact millions:

```json
{
    "metricQuery": {
        "metricOverrides": {
            "orders_total_revenue": {
                "formatOptions": {
                    "compact": "M",
                    "round": 1,
                    "separator": "default",
                    "type": "number"
                }
            }
        }
    }
}
```

Dimension override:

```json
{
    "metricQuery": {
        "dimensionOverrides": {
            "orders_amount": {
                "formatOptions": {
                    "round": 0,
                    "separator": "default",
                    "type": "number"
                }
            }
        }
    }
}
```
