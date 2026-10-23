import json


def diagnostics(offsets, start=None, end=None):
    records = []
    for path, offset in offsets.items():
        with path.open() as stream:
            stream.seek(offset)
            for line in stream:
                try:
                    event = json.loads(line[line.index("{") :])
                except ValueError:
                    continue
                timestamp = event.get("timestamp", "")
                if (start and timestamp < start) or (end and timestamp > end):
                    continue
                if event.get("level") != "error":
                    continue
                for message in str(event.get("message", "")).splitlines():
                    try:
                        nested = json.loads(message)
                    except ValueError:
                        continue
                    info = nested.get("info", {})
                    if info.get("level") == "error":
                        records.append(
                            {
                                "name": info.get("name"),
                                "timestamp": info.get("ts"),
                                "message": info.get("msg"),
                                "api_log_timestamp": timestamp,
                                "evidence_source": "owned API dbt command error output",
                            }
                        )
    return records
