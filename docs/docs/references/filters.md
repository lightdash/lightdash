---
sidebar_position: 2
---

# Filters reference sheet

Filters appear at the top of the Explore view and allow users to change the data being pulled in.

---

## Using filters

To learn more about using filters, check out our docs on limiting data using filters.

## Filter types

### Numeric filters

| Filter          | logic                                                                                                 |
|-----------------|-------------------------------------------------------------------------------------------------------|
| is null         | Only pulls in rows where the values are null for the field selected.                                  |
| is not null     | Only pulls in rows where the values are not null for the field selected.                              |
| is equal to     | Only pulls in rows where the values are equal to the values listed.                                   |
| is not equal to | Only pulls in rows where the values are not equal to the values listed.                               |
| is less than    | Only pulls in rows where the values for the field selected are strictly less than the value listed.   |
| is greater than | Only pulls in rows where the values for the field selectedare strictly greater than the value listed. |

### String filters

| Filter          | logic                                                                                              |
|-----------------|----------------------------------------------------------------------------------------------------|
| is null         | Only pulls in rows where the values are null for the field selected.                               |
| is not null     | Only pulls in rows where the values are not null for the field selected.                           |
| is equal to     | Only pulls in rows where the values are equal to the values listed.                                |
| is not equal to | Only pulls in rows where the values are not equal to the values listed.                            |
| starts with     | Only pulls in rows where the values for the field selected start with characters you've entered.   |
| includes        | Only pulls in rows where the values for the field selected includes the characters you've entered. |
| ends with       | Only pulls in rows where the values for the field selected end with the characters you've entered. |

### Boolean filters

| Filter      | logic                                                                    |
|-------------|--------------------------------------------------------------------------|
| is null     | Only pulls in rows where the values are null for the field selected.     |
| is not null | Only pulls in rows where the values are not null for the field selected. |
| is equal to | Only pulls in rows where the values are equal to the values listed.      |

### Date filters

| Filter          | logic                                                                                                     |
|-----------------|-----------------------------------------------------------------------------------------------------------|
| is null         | Only pulls in rows where the values are null for the field selected.                                      |
| is not null     | Only pulls in rows where the values are not null for the field selected.                                  |
| is equal to     | Only pulls in rows where the values are equal to the values listed.                                       |
| is not equal to | Only pulls in rows where the values are not equal to the values listed.                                   |
| in the last     | Only pulls in rows where the dates for the field selected are within the dynamic date range you selected. |
| is before       | Only pulls in rows where the dates for the field selected are strictly before the date you entered.       |
| is on or before | Only pulls in rows where the dates for the field selected are on or before the date you entered.          |
| is after        | Only pulls in rows where the dates for the field selected are strictly after the date you entered.        |
| is on or after  | Only pulls in rows where the dates for the field selected are on or after the date you entered.           |
| is between      | Only pulls in rows where the dates for the field selected are on or between the dates you entered.        |