# Rescue a project from an extra warehouse connection

Engineering runs this runbook when a project with multiple connections needs an extra connection removed and the
product cannot remove it, because content is still bound to it. There is no product operation that moves content to
the original connection. This is it.

## What the rescue does

In one transaction, under the project row lock:

1. It counts what is bound to the extra connection: explores, dbt sources, SQL chart versions and personal credential
   choices.
2. It sets the binding to NULL (the original connection) on the connection's SQL chart versions and dbt sources.
3. It deletes the connection's cached explores.
4. It deletes the connection. Personal credential choices, the sidebar cache and compiled artifacts cascade.
5. It records a `rescued_by_engineering` event with the engineer, the ticket and the counts.

When no extra connection is left, the project runs on the original connection only, with main's code.

## Before you start

- Get the project uuid and the connection uuid:
  `SELECT warehouse_connection_uuid, name, is_original FROM warehouse_connections WHERE project_uuid = '<project>';`
- Run a dry run and send the counts to the customer. Tell them that this content will run on the original
  connection's warehouse from now on. Their SQL charts run their SQL against that warehouse. Their explores come back
  from the next compile, compiled against the original connection.
- Make sure the customer agrees before you execute.
- Queries that are still running on the connection fail once it is removed. The rescue does not wait for them, unlike
  the product removal, which refuses while queries are in flight. Pick a quiet time or ask the customer to stop them.

## Run it

Dry run (changes nothing):

```bash
pnpm -F backend rescue-warehouse-connection --project <project uuid> --connection <connection uuid> \
    --engineer <your email> --ticket <ticket id>
```

Execute:

```bash
pnpm -F backend rescue-warehouse-connection --project <project uuid> --connection <connection uuid> \
    --engineer <your email> --ticket <ticket id> --execute
```

The script prints the counts and the route after the rescue (`single` when no extra connection is left).

## After the rescue

1. Trigger a compile of the project (Refresh dbt in the project settings, or the compile API). Until it runs, the
   explores of the removed connection are missing.
2. Check that the project's charts, dashboards and SQL charts load.
3. Queries that ran on the removed connection cannot be rerun or followed up. They fail with a message that names the
   connection. They never run on the original connection by themselves.

## What the script refuses

- The original connection, a connection of another project and an unknown uuid.
- A run without an engineer and a ticket.

A failure at any step rolls back every step.
