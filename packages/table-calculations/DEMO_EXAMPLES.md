# Table Calculations Demo Examples

## Basic Arithmetic

```
${revenue} + ${cost}
```
→ `("revenue" + "cost")`

```
${revenue} - ${cost}
```
→ `("revenue" - "cost")`

```
${a} + ${b} * ${c}
```
→ `("a" + ("b" * "c"))`  *(shows operator precedence)*

## String Concatenation

```
${first_name} & " " & ${last_name}
```
→ `(("first_name" || ' ') || "last_name")`

## Aggregate Functions

```
sum(${sales})
```
→ `SUM("sales")`

```
avg(${price})
```
→ `AVG("price")`

```
round(avg(${price}), 2)
```
→ `ROUND(AVG("price"), 2)`

## Window Functions

```
cumsum(${amount})
```
→ `SUM("amount") OVER (ORDER BY 1 ROWS UNBOUNDED PRECEDING)`

```
lag(${value}, 1)
```
→ `LAG("value", 1) OVER ()`

```
rank()
```
→ `RANK() OVER ()`

## Conditional Logic

```
if(${status} = "active", ${amount} * 1.1, ${amount})
```
→ `CASE WHEN ("status" = 'active') THEN ("amount" * 1.1) ELSE "amount" END`

```
if(${a} > 100, "high", if(${a} > 50, "medium", "low"))
```
→ Nested CASE statement

## Logical Operators

```
${a} > 10 and ${b} < 20
```
→ `(("a" > 10) AND ("b" < 20))`

```
${status} = "active" or ${status} = "pending"
```
→ `(("status" = 'active') OR ("status" = 'pending'))`

```
not ${is_deleted}
```
→ `NOT ("is_deleted")`

## Complex Business Logic

**Percent of Total:**
```
${sales} / sum(${sales}) * 100
```
→ `(("sales" / SUM("sales")) * 100)`

**Year-over-Year Growth:**
```
(${revenue} - lag(${revenue}, 12)) / lag(${revenue}, 12) * 100
```
→ `((("revenue" - LAG("revenue", 12) OVER ()) / LAG("revenue", 12) OVER ()) * 100)`

## Dialect-Specific Features

### DuckDB-specific functions:

```
median(${price})
```
→ `MEDIAN("price")`  *(only works in duckdb dialect)*

```
ntile(4)
```
→ `NTILE(4) OVER ()`

```
stddev(${amount})
```
→ `STDDEV("amount")`

### BigQuery-specific quoting:

```
${revenue} - ${cost}
```
→ `` (`revenue` - `cost`) ``  *(uses backticks instead of double quotes)*

## Demo Flow Suggestion

1. Start with **basic arithmetic** to show the core parsing
2. Show **operator precedence** to demonstrate smart parsing
3. Try **aggregate functions** like sum/avg
4. Demo **window functions** (cumsum, lag) to show advanced features
5. Show **conditionals** for business logic
6. Show **complex expressions** like percent of total
7. Switch dialects with `.dialect` to show BigQuery/DuckDB differences
