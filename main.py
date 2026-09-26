"""
MIDINS Forge — backend
Gestionnaire, générateur et exécuteur de scripts pour la cybersécurité.

Démarrage :
    python main.py
Puis ouvrir : http://127.0.0.1:8420
"""

import asyncio
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

from packs_seed import SEED_PACKS

# ---------------------------------------------------------------------------
# asyncio a besoin de ProactorEventLoop sous Windows pour piloter des
# sous-processus. On le force explicitement pour garantir la portabilité
# Linux / Windows exigée par le cahier des charges.
# ---------------------------------------------------------------------------
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

BASE_DIR = Path(__file__).resolve().parent
PACKS_DIR = BASE_DIR / "packs"
CONFIG_FILE = BASE_DIR / "config.json"
STATIC_DIR = BASE_DIR / "static"
RUNTIME_DIR = BASE_DIR / "runtime_logs"

PACKS_DIR.mkdir(exist_ok=True)
RUNTIME_DIR.mkdir(exist_ok=True)

app = FastAPI(title="MIDINS Forge")

VAR_RE = re.compile(r"\{\{\s*([A-Za-z0-9_]+)(?::([^}]*))?\s*\}\}")

LINUX_TERMINAL_CANDIDATES = [
    "x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal",
    "alacritty", "kitty", "tilix", "terminator", "xterm",
]

DEFAULT_PACK_DEPENDENCIES = {
    "recon-scan": ["nmap", "whois", "dnsutils", "curl", "traceroute", "masscan", "rustscan", "netcat-openbsd", "arp-scan"],
    "web-enum": ["gobuster", "nikto", "sqlmap", "whatweb", "wpscan", "dirb", "go"],
    "bruteforce-creds": ["hydra", "john", "hashcat", "medusa", "pipx", "git"],
    "exploitation-shells": ["netcat-openbsd", "socat", "php", "metasploit-framework"],
    "post-exploit-privesc": ["procps", "psmisc", "socat", "lsof", "curl", "findutils"],
    "ad-windows": ["smbclient", "pipx", "git"],
    "network-pivoting": ["proxychains4", "socat", "tcpdump", "nmap", "openssh-client", "go"],
    "blueteam-detection": ["yara", "suricata", "wireshark", "tcpdump", "net-tools", "chkrootkit", "rkhunter", "auditd"],
    "malware-analysis": ["yara", "binwalk", "foremost", "binutils", "file", "libimage-exiftool-perl", "upx-ucl", "less"],
    "osint": ["whois", "dnsutils", "curl", "pipx", "git", "go"],
    "cloud-containers": ["docker.io", "trivy", "awscli", "pipx"],
    "wireless": ["aircrack-ng", "iw", "wireless-tools", "pipx", "git"],
    "ctf-stego": ["steghide", "zsteg", "binwalk", "foremost", "libimage-exiftool-perl", "john"],
    "sysadmin-dev": ["git", "jq", "ripgrep", "htop", "rsync", "openssh-client", "curl", "findutils"],
}

PACKAGE_NAME_ALIASES = {
    "apt-get": {
        "go": "golang-go",
    },
    "dnf": {
        "dnsutils": "bind-utils",
        "docker.io": "docker",
        "go": "golang",
        "libimage-exiftool-perl": "perl-Image-ExifTool",
        "metasploit-framework": "metasploit",
        "netcat-openbsd": "nmap-ncat",
        "openssh-client": "openssh-clients",
        "pipx": "python3-pipx",
        "procps": "procps-ng",
        "upx-ucl": "upx",
    },
    "brew": {
        "dnsutils": "bind",
        "docker.io": "docker",
        "go": "go",
        "libimage-exiftool-perl": "exiftool",
        "metasploit-framework": "metasploit",
        "netcat-openbsd": "netcat",
        "openssh-client": "openssh",
        "pipx": "pipx",
        "python3-pip": "python",
        "upx-ucl": "upx",
    },
    "pacman": {
        "auditd": "audit",
        "awscli": "aws-cli",
        "dnsutils": "bind",
        "docker.io": "docker",
        "go": "go",
        "libimage-exiftool-perl": "perl-image-exiftool",
        "metasploit-framework": "metasploit",
        "netcat-openbsd": "openbsd-netcat",
        "openssh-client": "openssh",
        "pipx": "python-pipx",
        "proxychains4": "proxychains-ng",
        "procps": "procps-ng",
        "python3-impacket": "python-impacket",
        "python3-pip": "python-pip",
        "upx-ucl": "upx",
        "wireless-tools": "wireless_tools",
        "wireshark": "wireshark-cli",
    },
    "zypper": {
        "dnsutils": "bind-utils",
        "docker.io": "docker",
        "go": "go",
        "libimage-exiftool-perl": "perl-Image-ExifTool",
        "netcat-openbsd": "netcat-openbsd",
        "openssh-client": "openssh-clients",
        "pipx": "python3-pipx",
        "upx-ucl": "upx",
    },
}
PACKAGE_NAME_ALIASES["paru"] = PACKAGE_NAME_ALIASES["pacman"]
PACKAGE_NAME_ALIASES["yay"] = PACKAGE_NAME_ALIASES["pacman"]

PIPX_PACKAGES = {
    "osint": ["sherlock-project", "git+https://github.com/laramies/theHarvester.git", "shodan"],
    "ad-windows": ["impacket", "git+https://github.com/cddmp/enum4linux-ng.git", "git+https://github.com/Pennyw0rth/NetExec.git", "bloodhound"],
    "bruteforce-creds": ["hashid", "git+https://github.com/Pennyw0rth/NetExec.git"],
    "cloud-containers": ["kube-hunter"],
    "wireless": ["git+https://github.com/derv82/wifite.git"],
}

GO_INSTALL_PACKAGES = {
    "osint": [
        "github.com/owasp-amass/amass/v4/...@master",
        "github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest",
    ],
    "network-pivoting": ["github.com/jpillora/chisel@latest"],
    "web-enum": ["github.com/ffuf/ffuf/v2@latest"],
}

GO_TOOL_NAMES = {
    "osint": ["amass", "subfinder"],
    "network-pivoting": ["chisel"],
    "web-enum": ["ffuf"],
}

PACMAN_AUR_PACKAGES = {
    "blueteam-detection": ["suricata", "chkrootkit"],
    "ctf-stego": ["steghide", "zsteg"],
    "web-enum": ["whatweb", "dirb"],
}


# ---------------------------------------------------------------------------
# Modèles Pydantic
# ---------------------------------------------------------------------------

class GlobalVariablesPayload(BaseModel):
    global_variables: Dict[str, str]


class ExecuteRequest(BaseModel):
    command: str


class PackCreatePayload(BaseModel):
    pack_name: str
    description: Optional[str] = ""
    color: Optional[str] = "#3B82F6"
    icon: Optional[str] = "package"
    pack_tags: Optional[List[str]] = []
    dependencies: Optional[List[str]] = None


class PackUpdatePayload(BaseModel):
    pack_name: str
    description: Optional[str] = ""
    color: Optional[str] = "#3B82F6"
    icon: Optional[str] = "package"
    pack_tags: Optional[List[str]] = []
    dependencies: Optional[List[str]] = None


class ScriptPayload(BaseModel):
    title: str
    category: Optional[str] = ""
    description: Optional[str] = ""
    template: str
    tags: Optional[List[str]] = []


# ---------------------------------------------------------------------------
# Configuration locale (config.json)
# ---------------------------------------------------------------------------

def load_config() -> dict:
    if not CONFIG_FILE.exists():
        default = {"global_variables": {"LHOST": "", "INTERFACE": "tun0"}}
        CONFIG_FILE.write_text(json.dumps(default, indent=2, ensure_ascii=False), encoding="utf-8")
        return default
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        data = {}
    data.setdefault("global_variables", {})
    return data


def save_config(data: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# Packs (packs/*.json)
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return slug or f"pack-{uuid.uuid4().hex[:6]}"


def validate_pack_schema(data: dict) -> list:
    """Parseur robuste : ne lève jamais, retourne une liste d'erreurs lisibles."""
    errors = []
    if not isinstance(data, dict):
        return ["A pack must be a JSON object."]
    if not data.get("pack_name"):
        errors.append("Required field 'pack_name' is missing or empty.")
    if "pack_tags" in data and not isinstance(data["pack_tags"], list):
        errors.append("Invalid 'pack_tags' field (expected a list of strings).")
    dependencies = data.get("dependencies", [])
    if not isinstance(dependencies, list) or len(dependencies) > 100 or any(
        not isinstance(package, str)
        or (package and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9+_.:-]*", package.strip()))
        for package in dependencies
    ):
        errors.append("Invalid 'dependencies' field (expected up to 100 package names).")
    scripts = data.get("scripts", [])
    if not isinstance(scripts, list):
        errors.append("Invalid 'scripts' field (expected a list).")
    else:
        seen_ids = set()
        for i, s in enumerate(scripts):
            if not isinstance(s, dict):
                errors.append(f"Script #{i}: expected a JSON object.")
                continue
            if not s.get("id"):
                errors.append(f"Script #{i}: required field 'id' is missing.")
            elif s["id"] in seen_ids:
                errors.append(f"Script #{i}: duplicate id '{s['id']}'.")
            else:
                seen_ids.add(s["id"])
            if not s.get("title"):
                errors.append(f"Script #{i}: required field 'title' is missing.")
            if not s.get("template"):
                errors.append(f"Script #{i}: required field 'template' is missing.")
    return errors


def pack_path(pack_id: str) -> Path:
    return PACKS_DIR / f"{slugify(pack_id)}.json"


def load_pack_or_404(pack_id: str) -> tuple:
    path = pack_path(pack_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Pack not found.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Pack file is corrupted.")
    return data, path


def save_pack(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def unique_script_id(scripts: list, base_title: str) -> str:
    base_slug = slugify(base_title)
    existing = {s.get("id") for s in scripts}
    if base_slug not in existing:
        return base_slug
    i = 2
    while f"{base_slug}-{i}" in existing:
        i += 1
    return f"{base_slug}-{i}"


def load_all_packs() -> list:
    packs = []
    for f in sorted(PACKS_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if validate_pack_schema(data):
            continue  # pack corrompu / invalide : ignoré silencieusement au chargement
        data["_file"] = f.name
        data.setdefault("pack_id", slugify(data["pack_name"]))
        data.setdefault("dependencies", DEFAULT_PACK_DEPENDENCIES.get(data["pack_id"], []))
        data["pipx_dependencies"] = PIPX_PACKAGES.get(data["pack_id"], [])
        data["go_dependencies"] = GO_INSTALL_PACKAGES.get(data["pack_id"], [])
        data.setdefault("color", "#3B82F6")
        data.setdefault("icon", "package")
        data.setdefault("pack_tags", [])
        packs.append(data)
    return packs


def seed_default_packs_if_empty() -> None:
    if any(PACKS_DIR.glob("*.json")):
        return
    for pack in SEED_PACKS:
        path = PACKS_DIR / f"{pack['pack_id']}.json"
        path.write_text(json.dumps(pack, indent=2, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# Exécution — lance un véritable terminal externe et récupère le résultat
# ---------------------------------------------------------------------------
#
# Plutôt qu'un sous-processus caché piloté par des pipes (moins fiable pour
# les commandes interactives : sudo, prompts, TTY requis par de nombreux
# outils de cybersécurité), la commande est lancée dans une vraie fenêtre de
# terminal du système. Sa sortie est simultanément dupliquée vers un fichier
# journal que le backend surveille et diffuse vers le site via SSE.
#
# Si aucun émulateur de terminal graphique n'est détecté (ex. serveur sans
# interface graphique), on retombe automatiquement sur l'ancien mode intégré
# (sous-processus avec pipes), pour que l'outil reste utilisable partout.

EXIT_MARKER = "MIDINS_EXITCODE:"


class ExecutionSession:
    __slots__ = ("id", "command", "process", "queue", "start_time", "finished", "log_path", "mode")

    def __init__(self, execution_id: str, command: str):
        self.id = execution_id
        self.command = command
        self.process = None
        self.queue: asyncio.Queue = asyncio.Queue()
        self.start_time = time.time()
        self.finished = False
        self.log_path: Optional[Path] = None
        self.mode = "terminal"  # "terminal" ou "inline"


SESSIONS: Dict[str, ExecutionSession] = {}


def _find_linux_terminal() -> Optional[str]:
    for name in LINUX_TERMINAL_CANDIDATES:
        if shutil.which(name):
            return name
    return None


def _write_linux_script(command: str, log_path: Path, script_path: Path) -> None:
    content = (
        "#!/usr/bin/env bash\n"
        f'exec > >(tee "{log_path}") 2>&1\n'
        f"{command}\n"
        "__MIDINS_CODE=$?\n"
        f'echo "{EXIT_MARKER}$__MIDINS_CODE"\n'
        "echo\n"
        'echo "--- [MIDINS Forge] Finished — exit code: $__MIDINS_CODE ---"\n'
        'read -p "Press Enter to close this window..." _\n'
    )
    script_path.write_text(content, encoding="utf-8")
    script_path.chmod(0o755)


def _write_windows_script(command: str, log_path: Path, script_path: Path) -> None:
    content = (
        "$ErrorActionPreference = 'Continue'\n"
        f'& {{ {command} }} *>&1 | Tee-Object -FilePath "{log_path}"\n'
        "$code = $LASTEXITCODE\n"
        "if ($null -eq $code) { $code = 0 }\n"
        f'Add-Content -Path "{log_path}" -Value "{EXIT_MARKER}$code"\n'
        'Write-Host ""\n'
        'Write-Host "--- [MIDINS Forge] Finished - exit code: $code ---"\n'
        'Read-Host "Press Enter to close this window"\n'
    )
    script_path.write_text(content, encoding="utf-8")


def _launch_terminal(session: ExecutionSession) -> bool:
    """Tente de lancer une vraie fenêtre de terminal. Retourne True si réussi."""
    log_path = RUNTIME_DIR / f"{session.id}.log"
    session.log_path = log_path

    try:
        if sys.platform == "win32":
            script_path = RUNTIME_DIR / f"{session.id}.ps1"
            _write_windows_script(session.command, log_path, script_path)
            proc = subprocess.Popen(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script_path)],
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
            session.process = proc
            return True

        terminal = _find_linux_terminal()
        if not terminal:
            return False
        script_path = RUNTIME_DIR / f"{session.id}.sh"
        _write_linux_script(session.command, log_path, script_path)

        if terminal == "gnome-terminal":
            argv = [terminal, "--", "bash", str(script_path)]
        elif terminal in ("xfce4-terminal", "terminator"):
            argv = [terminal, "-x", "bash", str(script_path)]
        else:
            argv = [terminal, "-e", "bash", str(script_path)]

        proc = subprocess.Popen(argv, start_new_session=True)
        session.process = proc
        return True
    except Exception:
        return False


async def _tail_log_and_stream(session: ExecutionSession) -> None:
    last_size = 0
    exit_code: Optional[int] = None
    grace_after_process_exit = 0

    while True:
        await asyncio.sleep(0.3)

        if session.log_path and session.log_path.exists():
            try:
                content = session.log_path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                content = ""
            if len(content) > last_size:
                new_text = content[last_size:]
                last_size = len(content)
                for line in new_text.splitlines():
                    if line.startswith(EXIT_MARKER):
                        try:
                            exit_code = int(line[len(EXIT_MARKER):].strip())
                        except ValueError:
                            exit_code = -1
                    elif line.strip():
                        await session.queue.put({"type": "stdout", "data": line})

        if exit_code is not None:
            break

        if session.process is not None and session.process.poll() is not None:
            # La fenêtre de terminal s'est fermée (manuellement, ou juste après
            # la fin de la commande). On laisse un court délai pour que le
            # fichier journal finisse de s'écrire, puis on arrête.
            grace_after_process_exit += 1
            if grace_after_process_exit > 5:
                break

    duration = round(time.time() - session.start_time, 2)
    if exit_code is None:
        exit_code = 0
        await session.queue.put({"type": "stdout", "data": "[MIDINS Forge] Terminal closed — exit code was not captured."})
        await session.queue.put({"type": "done", "exit_code": exit_code, "duration": duration})
        session.finished = True
    await session.queue.put({"type": "done", "exit_code": exit_code, "duration": duration})
    session.finished = True


async def _read_stream(stream, stream_name: str, queue: asyncio.Queue) -> None:
    while True:
        line = await stream.readline()
        if not line:
            break
        text = line.decode(errors="replace").rstrip("\n")
        await queue.put({"type": stream_name, "data": text})


async def _run_inline_fallback(session: ExecutionSession) -> None:
    """Mode de secours (sans fenêtre graphique) : sous-processus avec pipes."""
    await session.queue.put({
        "type": "stdout",
        "data": "[MIDINS Forge] No graphical terminal found — running in the integrated mode.",
    })
    try:
        process = await asyncio.create_subprocess_shell(
            session.command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        session.process = process
        await asyncio.gather(
            _read_stream(process.stdout, "stdout", session.queue),
            _read_stream(process.stderr, "stderr", session.queue),
        )
        exit_code = await process.wait()
        duration = round(time.time() - session.start_time, 2)
        await session.queue.put({"type": "done", "exit_code": exit_code, "duration": duration})
    except Exception as exc:
        duration = round(time.time() - session.start_time, 2)
        await session.queue.put({"type": "stderr", "data": f"[MIDINS Forge] Execution error: {exc}"})
        await session.queue.put({"type": "done", "exit_code": -1, "duration": duration})
    finally:
        session.finished = True


async def _start_execution(session: ExecutionSession) -> None:
    launched = await asyncio.get_running_loop().run_in_executor(None, _launch_terminal, session)
    if launched:
        session.mode = "terminal"
        await _tail_log_and_stream(session)
    else:
        session.mode = "inline"
        await _run_inline_fallback(session)


# ---------------------------------------------------------------------------
# Routes API — Packs & Config
# ---------------------------------------------------------------------------

@app.get("/api/packs")
async def api_get_packs():
    return {"packs": load_all_packs()}


@app.post("/api/packs")
async def api_create_pack(payload: PackCreatePayload):
    pack_id = slugify(payload.pack_name)
    path = pack_path(pack_id)
    if path.exists():
        pack_id = f"{pack_id}-{uuid.uuid4().hex[:4]}"
        path = pack_path(pack_id)
    data = {
        "pack_id": pack_id,
        "pack_name": payload.pack_name,
        "author": "Vous",
        "version": "1.0",
        "color": payload.color or "#3B82F6",
        "icon": payload.icon or "package",
        "pack_tags": payload.pack_tags or [],
        "description": payload.description or "",
        "dependencies": validate_dependencies(payload.dependencies or []),
        "scripts": [],
    }
    save_pack(path, data)
    data["_file"] = path.name
    return {"status": "ok", "pack": data}


@app.put("/api/packs/{pack_id}")
async def api_update_pack(pack_id: str, payload: PackUpdatePayload):
    data, path = load_pack_or_404(pack_id)
    data["pack_name"] = payload.pack_name
    data["description"] = payload.description or ""
    data["color"] = payload.color or "#3B82F6"
    data["icon"] = payload.icon or "package"
    data["pack_tags"] = payload.pack_tags or []
    if payload.dependencies is not None:
        data["dependencies"] = validate_dependencies(payload.dependencies)
    save_pack(path, data)
    data["_file"] = path.name
    return {"status": "ok", "pack": data}


@app.post("/api/packs/import")
async def api_import_pack(request: Request):
    raw = await request.body()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")

    errors = validate_pack_schema(data)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})

    pack_id = slugify(data.get("pack_id") or data["pack_name"])
    data["pack_id"] = pack_id
    data.setdefault("color", "#3B82F6")
    data.setdefault("icon", "package")
    data.setdefault("pack_tags", [])
    data.setdefault("dependencies", DEFAULT_PACK_DEPENDENCIES.get(pack_id, []))
    filename = f"{pack_id}.json"
    (PACKS_DIR / filename).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"status": "ok", "pack_id": pack_id, "file": filename}


def validate_dependencies(packages: List[str]) -> List[str]:
    cleaned = []
    for package in packages:
        package = package.strip()
        if not package:
            continue
        if len(package) > 100 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9+_.:-]*", package):
            raise HTTPException(status_code=422, detail=f"Invalid package name: {package}")
        if package not in cleaned:
            cleaned.append(package)
    if len(cleaned) > 100:
        raise HTTPException(status_code=422, detail="A pack can list at most 100 packages.")
    return cleaned


@app.post("/api/packs/{pack_id}/install")
async def api_install_pack_dependencies(pack_id: str):
    data, _ = load_pack_or_404(pack_id)
    packages = validate_dependencies(data.get("dependencies", DEFAULT_PACK_DEPENDENCIES.get(pack_id, [])))
    if not packages:
        raise HTTPException(status_code=400, detail="This pack has no package dependencies configured.")

    managers = [
        ("paru", "-S --needed"),
        ("yay", "-S --needed"),
        ("apt-get", "install -y --"),
        ("dnf", "install -y --"),
        ("pacman", "-S --needed --noconfirm --"),
        ("zypper", "--non-interactive install --"),
        ("brew", "install"),
    ]
    selected = next(((manager, shutil.which(manager), args) for manager, args in managers if shutil.which(manager)), None)
    if not selected:
        raise HTTPException(status_code=501, detail="No supported package manager found (apt, dnf, pacman, zypper, brew).")

    manager, executable, arguments = selected
    if manager == "pacman" and PACMAN_AUR_PACKAGES.get(pack_id):
        aur_tools = ", ".join(PACMAN_AUR_PACKAGES[pack_id])
        raise HTTPException(
            status_code=501,
            detail=f"This pack includes AUR tools ({aur_tools}). Install paru or yay to review/build them, or remove them from the pack dependencies.",
        )
    needs_sudo = manager not in {"brew", "paru", "yay"} and hasattr(os, "geteuid") and os.geteuid() != 0
    if needs_sudo and not shutil.which("sudo"):
        raise HTTPException(status_code=501, detail="Administrator privileges are required, but sudo is not installed.")
    prefix = "sudo " if needs_sudo else ""
    install_packages = [PACKAGE_NAME_ALIASES.get(manager, {}).get(package, package) for package in packages]
    command = f"{prefix}{shlex.quote(executable)} {arguments} " + " ".join(shlex.quote(pkg) for pkg in install_packages)
    pipx_packages = PIPX_PACKAGES.get(pack_id, [])
    if pipx_packages:
        pipx = shutil.which("pipx") or "pipx"
        command += " && " + " && ".join(
            f"{shlex.quote(pipx)} install {shlex.quote(package)}" for package in pipx_packages
        )
        install_packages.extend(pipx_packages)
    go_packages = GO_INSTALL_PACKAGES.get(pack_id, [])
    if go_packages:
        go = shutil.which("go") or "go"
        command += " && " + " && ".join(
            f"{shlex.quote(go)} install {shlex.quote(package)}" for package in go_packages
        )
        install_packages.extend(GO_TOOL_NAMES.get(pack_id, []))
    return {"status": "ok", "command": command, "packages": install_packages, "package_manager": manager}


@app.delete("/api/packs/{filename}")
async def api_delete_pack(filename: str):
    if "/" in filename or "\\" in filename or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    target = PACKS_DIR / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="Pack not found.")
    target.unlink()
    return {"status": "ok"}


@app.post("/api/packs/{pack_id}/scripts")
async def api_add_script(pack_id: str, payload: ScriptPayload):
    data, path = load_pack_or_404(pack_id)
    if not payload.title.strip() or not payload.template.strip():
        raise HTTPException(status_code=422, detail={"errors": ["Title and template are required."]})
    scripts = data.setdefault("scripts", [])
    script = {
        "id": unique_script_id(scripts, payload.title),
        "title": payload.title,
        "category": payload.category or "",
        "description": payload.description or "",
        "template": payload.template,
        "tags": payload.tags or [],
    }
    scripts.append(script)
    save_pack(path, data)
    return {"status": "ok", "script": script}


@app.put("/api/packs/{pack_id}/scripts/{script_id}")
async def api_update_script(pack_id: str, script_id: str, payload: ScriptPayload):
    data, path = load_pack_or_404(pack_id)
    scripts = data.get("scripts", [])
    for s in scripts:
        if s.get("id") == script_id:
            s["title"] = payload.title
            s["category"] = payload.category or ""
            s["description"] = payload.description or ""
            s["template"] = payload.template
            s["tags"] = payload.tags or []
            save_pack(path, data)
            return {"status": "ok", "script": s}
    raise HTTPException(status_code=404, detail="Script not found.")


@app.delete("/api/packs/{pack_id}/scripts/{script_id}")
async def api_delete_script(pack_id: str, script_id: str):
    data, path = load_pack_or_404(pack_id)
    scripts = data.get("scripts", [])
    new_scripts = [s for s in scripts if s.get("id") != script_id]
    if len(new_scripts) == len(scripts):
        raise HTTPException(status_code=404, detail="Script not found.")
    data["scripts"] = new_scripts
    save_pack(path, data)
    return {"status": "ok"}


@app.get("/api/config")
async def api_get_config():
    return load_config()


@app.post("/api/config")
async def api_update_config(payload: GlobalVariablesPayload):
    data = load_config()
    data["global_variables"] = payload.global_variables
    save_config(data)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Routes API — Exécution
# ---------------------------------------------------------------------------

@app.post("/api/execute")
async def api_start_execution(payload: ExecuteRequest):
    if not payload.command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty.")
    execution_id = uuid.uuid4().hex[:12]
    session = ExecutionSession(execution_id, payload.command)
    SESSIONS[execution_id] = session
    asyncio.create_task(_start_execution(session))
    return {"execution_id": execution_id}


@app.get("/api/execute/{execution_id}/stream")
async def api_stream_execution(execution_id: str):
    session = SESSIONS.get(execution_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    async def event_generator():
        while True:
            item = await session.queue.get()
            yield f"data: {json.dumps(item)}\n\n"
            if item.get("type") == "done":
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/execute/{execution_id}/kill")
async def api_kill_execution(execution_id: str):
    session = SESSIONS.get(execution_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.finished or session.process is None:
        return {"status": "already_finished"}
    try:
        if session.mode == "inline":
            # Sous-processus direct du serveur (pas de fenêtre, pas de groupe
            # dédié) : on cible uniquement ce process, jamais killpg ici — le
            # tuer via son groupe tuerait le serveur MIDINS Forge lui-même.
            session.process.send_signal(signal.SIGTERM)
        elif sys.platform == "win32":
            # Fenêtre PowerShell : taskkill /T tue tout l'arbre de processus
            # de la fenêtre (y compris la commande en cours).
            subprocess.run(
                ["taskkill", "/PID", str(session.process.pid), "/T", "/F"],
                capture_output=True, check=False,
            )
        else:
            # Fenêtre de terminal Linux : lancée avec start_new_session=True,
            # elle possède son propre groupe de processus, distinct de celui
            # du serveur — killpg est donc sûr ici.
            import os
            try:
                pgid = os.getpgid(session.process.pid)
                os.killpg(pgid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    except Exception:
        pass
    return {"status": "killed"}


# ---------------------------------------------------------------------------
# Frontend statique (SPA)
# ---------------------------------------------------------------------------

app.mount("/assets", StaticFiles(directory=str(STATIC_DIR)), name="assets")


@app.get("/")
async def index():
    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Démarrage
# ---------------------------------------------------------------------------

def main():
    user_bin = Path.home() / ".local" / "bin"
    go_bin = Path.home() / "go" / "bin"
    os.environ["PATH"] = os.pathsep.join([str(user_bin), str(go_bin), os.environ.get("PATH", "")])
    seed_default_packs_if_empty()
    load_config()
    for f in RUNTIME_DIR.glob("*"):
        try:
            f.unlink()
        except OSError:
            pass
    print("=" * 56)
    print("  MIDINS Forge")
    host = os.environ.get("MIDINS_HOST", "127.0.0.1")
    port = int(os.environ.get("MIDINS_PORT", "8420"))
    print(f"  http://{host}:{port}")
    print("  (Press Ctrl+C to stop)")
    print("=" * 56)
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
