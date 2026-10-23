from prod_shaped_fixture import DUPLICATE

GUIDANCE = "Refresh again; the next compile usually succeeds."
STALE = (
    'dbt source "proj_growth" was compiled against an out-of-date version of model '
    f'"{DUPLICATE}" from dbt source "dbt_project" and the compile ran out of retries.'
)
WARNING = (
    'Model "consumer_one_arg" in dbt source "proj_growth" uses '
    f"ref('{DUPLICATE}'), which resolved to external model "
    f"model.proj_analyst.{DUPLICATE} from another dbt source. "
    f"Use ref('proj_analyst', '{DUPLICATE}') to make the cross-source reference explicit."
)
CYCLE_PREFIX = "dbt models form a cycle across dbt sources: "
CYCLE_SUFFIX = ". Break the cycle in one of these models."


def cycle_messages(graph):
    path = graph["closedUniqueIds"][:-1]
    return [
        CYCLE_PREFIX + " -> ".join(path[index:] + path[: index + 1]) + CYCLE_SUFFIX
        for index in range(len(path))
    ]


def evaluate(row):
    mixed = row["variant"] == "prod-mixed"
    pre = row["build"] == "pre"
    expected = {
        "refresh_success": mixed and not pre,
        "cycle_present": not mixed,
        "warning_present": mixed,
        "error_present": not mixed or pre,
        "stale_error_present": mixed and pre,
        "exact_trailing_guidance_present": mixed and pre,
        "warning_before_stale_error": mixed and pre,
    }
    warnings = []
    errors = []
    starts = []
    terminal = []
    for index, event in enumerate(row["events"]):
        record = {
            "index": index,
            "timestamp": event.get("timestamp"),
            "event": event.get("event"),
            "message": event.get("message"),
            "log_file": event.get("captureLogFile"),
            "log_line": event.get("captureLogLine"),
        }
        if event.get("event") == "dbt.compile.sourceFetchStart":
            starts.append(record)
        if event.get("event") in ("dbt.compile.end.ok", "dbt.compile.end.failed"):
            terminal.append(record)
        if event.get("event") == "dbt.compile.crossSourceRefWarning":
            warnings.append({**record, "warning": event.get("warning")})
        if event.get("event") == "dbt.compile.failed":
            errors.append(record)
    stale_messages = [
        message
        for message in row["messages"]
        if message.startswith(
            'dbt source "proj_growth" was compiled against an out-of-date version'
        )
    ]
    cycle_errors = [
        message for message in row["messages"] if message.startswith(CYCLE_PREFIX)
    ]
    stale_events = [error for error in errors if STALE in (error["message"] or "")]
    ordered = any(
        warning["index"] < error["index"]
        and warning["timestamp"] is not None
        and error["timestamp"] is not None
        and warning["timestamp"] <= error["timestamp"]
        for warning in warnings
        for error in stale_events
    )
    observed = {
        "refresh_success": row["operation"]["success"],
        "cycle_present": row["cycle_error"],
        "warning_present": bool(warnings),
        "error_present": bool(errors),
        "stale_error_present": row["stale_retry_error"],
        "exact_trailing_guidance_present": any(
            message.endswith(GUIDANCE) for message in stale_messages
        ),
        "warning_before_stale_error": ordered,
    }
    checks = {
        key: {
            "expected": value,
            "observed": observed[key],
            "pass": value == observed[key],
        }
        for key, value in expected.items()
    }

    def assertion(name, expected_value, observed_value):
        checks[name] = {
            "expected": expected_value,
            "observed": observed_value,
            "pass": expected_value == observed_value,
        }

    assertion(
        "service_account_actor", True, row["operation"].get("actor_is_service_account")
    )
    assertion("source_count", 19, row["source_count"])
    assertion("flag_on", True, row["runtime_flags"]["cross-source-dbt-refs"]["enabled"])
    assertion(
        "multi_source_on", True, row["runtime_flags"]["multi-dbt-sources"]["enabled"]
    )
    assertion("inspector_counters", "inspector", row["counter_evidence"]["method"])
    assertion(
        "counters_agree", True, row["counter_evidence"].get("agrees_with_product_log")
    )
    assertion("single_compile_window", 1, len(starts))
    assertion("compile_window_correlated", True, row["compile_window"]["correlated"])
    assertion(
        "exact_warning",
        [WARNING] if mixed else [],
        [warning["warning"] for warning in warnings],
    )
    assertion(
        "exact_stale_message",
        [STALE + " " + GUIDANCE] if mixed and pre else [],
        stale_messages,
    )
    assertion(
        "guidance_absent_from_all_messages",
        not (mixed and pre),
        not any(GUIDANCE in message for message in row["messages"]),
    )
    graph = row["configured"]["proposedCycle"]
    assertion(
        "exact_closed_cycle_message",
        not mixed,
        len(cycle_errors) == 1 and cycle_errors[0] in cycle_messages(graph),
    )
    assertion(
        "parsed_model_count",
        41,
        row["publication"]["parsed_manifest_validation"]["model_count"],
    )
    assertion(
        "parsed_versions",
        sorted(row["configured"]["versionedModels"]),
        row["publication"]["parsed_manifest_validation"]["versioned_ids"],
    )
    assertion(
        "parsed_unversioned_decoys",
        sorted(row["configured"]["unversionedDecoys"]),
        row["publication"]["parsed_manifest_validation"]["decoy_ids"],
    )
    return {
        "expectation_basis": (
            "Pre-fix reproduction"
            if pre
            else "Comparative post-2.631.0 target; cycle-pr does not include the stale-binding fix from PR 31313"
            if row["build"] == "cycle-pr"
            else "Post-2.631.0 stale-binding fix"
        ),
        "expected": expected,
        "observed": observed,
        "checks": checks,
        "pass": all(check["pass"] for check in checks.values()),
        "sequence": {
            "index_basis": "zero-based captured compile events in timestamp order; adjacency is not required",
            "scope": "log offsets after project setup, around one serial service-account refresh",
            "starts": starts,
            "warnings": warnings,
            "errors": errors,
            "terminal": terminal,
            "ordered": ordered,
        },
        "exact_strings": {
            "warnings": [warning["warning"] for warning in warnings],
            "stale_errors": stale_messages,
            "cycle_errors": cycle_errors,
            "required_trailing_text": GUIDANCE,
        },
    }
