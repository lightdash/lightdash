#!/usr/bin/env python3
"""Talk to an exe.dev VM's Shelley agent over HTTPS.

This is the HTTPS-only transport for environments where outbound SSH (port 22)
is blocked but HTTPS to *.exe.xyz is allowed (e.g. Claude Code on the web). Two
subcommands cover what the SSH transport does:

  exec      Run a command on the VM over the Shelley exec websocket, streaming
            output and returning the remote exit code. Same protocol the web
            terminal uses:

                wss://<vm>.shelley.exe.xyz/api/exec-ws?cmd=<cmd>&cwd=<cwd>
                    header: X-Exedev-Authorization: Bearer <vm-token>
                    -> send  {"type":"init","cols":<c>,"rows":<r>}
                    <- recv  {"type":"output","data":"<base64>"}   (a pty)
                             {"type":"attached","term_id":"..."}
                             {"type":"exit","data":"<code>"}
                             {"type":"error","data":"..."}

  put-file  Write a local file to the VM via POST /api/write-file
            ({"path":...,"content":...}). Used for working-tree sync, since the
            exec websocket has no stdin to pipe tar/git through.

The VM token is a VM-scoped exe.dev API key (namespace v0@<vm>.exe.xyz), minted
with `ssh-key generate-api-key --vm=<vm>`. It is read from the env var named by
--token-env (default LIGHTDASH_EXE_VM_TOKEN).

Only the Python standard library is used; there is no websocket dependency.
`exec` exits with the remote command's exit code (or a negative code on a
transport/protocol failure); `put-file` exits 0 on a 2xx write.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request


def _fail(message: str, code: int = 2) -> "NoReturn":  # type: ignore[name-defined]
    sys.stderr.write(f"exedev-shelley-exec: {message}\n")
    raise SystemExit(code)


class WebSocketError(Exception):
    pass


class WebSocket:
    """Minimal RFC 6455 client: TLS connect, handshake, framed read/write."""

    def __init__(self, host: str, path: str, headers: dict[str, str], timeout: float):
        self._buf = b""
        raw = socket.create_connection((host, 443), timeout=timeout)
        ctx = ssl.create_default_context()
        self._sock = ctx.wrap_socket(raw, server_hostname=host)
        self._handshake(host, path, headers)

    def _handshake(self, host: str, path: str, headers: dict[str, str]) -> None:
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        lines = [
            f"GET {path} HTTP/1.1",
            f"Host: {host}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {key}",
            "Sec-WebSocket-Version: 13",
        ]
        for name, value in headers.items():
            lines.append(f"{name}: {value}")
        self._sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())

        while b"\r\n\r\n" not in self._buf:
            chunk = self._sock.recv(4096)
            if not chunk:
                raise WebSocketError("connection closed during handshake")
            self._buf += chunk
        header_blob, self._buf = self._buf.split(b"\r\n\r\n", 1)
        status_line = header_blob.split(b"\r\n", 1)[0].decode("latin-1")
        if "101" not in status_line:
            raise WebSocketError(f"handshake rejected: {status_line}")

    def _recv_exact(self, n: int) -> bytes:
        while len(self._buf) < n:
            chunk = self._sock.recv(65536)
            if not chunk:
                raise WebSocketError("connection closed by server")
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def send_text(self, text: str) -> None:
        payload = text.encode()
        header = bytearray([0x81])  # FIN + text opcode
        mask = secrets.token_bytes(4)
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header += length.to_bytes(2, "big")
        else:
            header.append(0x80 | 127)
            header += length.to_bytes(8, "big")
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self._sock.sendall(bytes(header) + masked)

    def _send_control(self, opcode: int, payload: bytes = b"") -> None:
        mask = secrets.token_bytes(4)
        frame = bytearray([0x80 | opcode, 0x80 | len(payload)]) + mask
        frame += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self._sock.sendall(bytes(frame))

    def recv_message(self) -> tuple[int, bytes]:
        """Return (opcode, payload) for the next complete message.

        Reassembles fragments and answers pings transparently; the returned
        opcode is that of the first frame in the message (1 text, 2 binary,
        8 close).
        """
        message = bytearray()
        first_opcode: int | None = None
        while True:
            b0, b1 = self._recv_exact(2)
            fin = b0 & 0x80
            opcode = b0 & 0x0F
            masked = b1 & 0x80
            length = b1 & 0x7F
            if length == 126:
                length = int.from_bytes(self._recv_exact(2), "big")
            elif length == 127:
                length = int.from_bytes(self._recv_exact(8), "big")
            payload = self._recv_exact(length)
            if masked:  # servers must not mask, but unmask defensively
                payload = bytes(b ^ payload[0] for b in payload)  # unreachable normally

            if opcode == 0x9:  # ping -> pong, not part of a message
                self._send_control(0xA, payload)
                continue
            if opcode == 0xA:  # pong
                continue
            if opcode == 0x8:  # close
                return 0x8, bytes(payload)

            if first_opcode is None:
                first_opcode = opcode
            message += payload
            if fin:
                return first_opcode or 0x1, bytes(message)

    def close(self) -> None:
        try:
            self._send_control(0x8)
        except OSError:
            pass
        try:
            self._sock.close()
        except OSError:
            pass


def run(
    vm: str,
    command: str,
    cwd: str,
    token: str,
    control_domain: str,
    cols: int,
    rows: int,
    timeout: float,
) -> int:
    host = f"{vm}.shelley.{control_domain}"
    query = urllib.parse.urlencode({"cmd": command, "cwd": cwd})
    path = f"/api/exec-ws?{query}"
    headers = {"X-Exedev-Authorization": f"Bearer {token}"}

    try:
        ws = WebSocket(host, path, headers, timeout)
    except (OSError, WebSocketError, ssl.SSLError) as exc:
        _fail(f"could not open exec session on {host}: {exc}", 3)

    exit_code = -1
    try:
        ws.send_text(json.dumps({"type": "init", "cols": cols, "rows": rows}))
        stdout = sys.stdout.buffer
        while True:
            try:
                opcode, payload = ws.recv_message()
            except WebSocketError as exc:
                sys.stderr.write(f"exedev-shelley-exec: {exc}\n")
                break
            if opcode == 0x8:  # close
                break
            try:
                msg = json.loads(payload.decode("utf-8", "replace"))
            except json.JSONDecodeError:
                continue
            kind = msg.get("type")
            data = msg.get("data")
            if kind == "output" and data:
                try:
                    stdout.write(base64.b64decode(data))
                except (ValueError, TypeError):
                    pass
                stdout.flush()
            elif kind == "exit":
                try:
                    exit_code = int(data)
                except (TypeError, ValueError):
                    exit_code = 0
                break
            elif kind == "error":
                sys.stderr.write(f"exedev-shelley-exec: remote error: {data}\n")
                exit_code = 1
                break
    finally:
        ws.close()
    return exit_code


def put_file(
    vm: str,
    remote_path: str,
    local_path: str,
    token: str,
    control_domain: str,
    timeout: float,
) -> int:
    host = f"{vm}.shelley.{control_domain}"
    url = f"https://{host}/api/write-file"
    try:
        with open(local_path, "r", encoding="utf-8") as handle:
            content = handle.read()
    except OSError as exc:
        _fail(f"cannot read {local_path}: {exc}", 5)
    except UnicodeDecodeError:
        _fail(f"refusing to sync non-UTF-8 file over write-file: {local_path}", 6)

    body = json.dumps({"path": remote_path, "content": content}).encode()
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Exedev-Authorization": f"Bearer {token}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            if 200 <= resp.status < 300:
                return 0
            _fail(f"write-file returned HTTP {resp.status} for {remote_path}", 3)
    except urllib.error.HTTPError as exc:
        _fail(f"write-file HTTP {exc.code} for {remote_path}: {exc.read()!r}", 3)
    except (OSError, ssl.SSLError) as exc:
        _fail(f"write-file to {host} failed: {exc}", 3)
    return 0


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--vm", required=True, help="VM name (e.g. ld-cc-abc123)")
    parser.add_argument(
        "--token-env",
        default="LIGHTDASH_EXE_VM_TOKEN",
        help="Env var holding the VM-scoped exe.dev API token",
    )
    parser.add_argument(
        "--control-domain",
        default=os.environ.get("LIGHTDASH_EXEDEV_VM_DOMAIN", "exe.xyz"),
        help="VM domain suffix (default exe.xyz)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.environ.get("EXEDEV_SHELLEY_TIMEOUT", "120")),
        help="Socket timeout in seconds",
    )


def _resolve_token(token_env: str) -> str:
    token = os.environ.get(token_env, "").strip()
    if not token:
        _fail(f"{token_env} is not set", 4)
    return token


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="exedev-shelley-exec",
        description="Talk to an exe.dev VM's Shelley agent over HTTPS.",
    )
    sub = parser.add_subparsers(dest="subcommand", required=True)

    exec_parser = sub.add_parser("exec", help="Run a command on the VM")
    _add_common(exec_parser)
    exec_parser.add_argument(
        "--cwd", default="/home/exedev", help="Working directory on the VM"
    )
    exec_parser.add_argument("--cols", type=int, default=200)
    exec_parser.add_argument("--rows", type=int, default=50)
    exec_parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Command to run (everything after the options)",
    )

    put_parser = sub.add_parser("put-file", help="Write a local file to the VM")
    _add_common(put_parser)
    put_parser.add_argument("--remote-path", required=True, help="Absolute path on the VM")
    put_parser.add_argument("--local-path", required=True, help="Local file to upload")

    args = parser.parse_args(argv)
    token = _resolve_token(args.token_env)

    if args.subcommand == "exec":
        command = " ".join(args.command).strip()
        if not command:
            _fail("no command given", 2)
        return run(
            vm=args.vm,
            command=command,
            cwd=args.cwd,
            token=token,
            control_domain=args.control_domain,
            cols=args.cols,
            rows=args.rows,
            timeout=args.timeout,
        )

    return put_file(
        vm=args.vm,
        remote_path=args.remote_path,
        local_path=args.local_path,
        token=token,
        control_domain=args.control_domain,
        timeout=args.timeout,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
