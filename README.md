# ⚒️ MIDINS Forge

> A local command center for organizing, parameterizing, and running authorized cybersecurity workflows.

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/API-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-555555)](#requirements)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`#cybersecurity` `#infosec` `#osint` `#automation` `#python` `#local-first`

MIDINS Forge turns a collection of security scripts into a practical, searchable command workspace. Group commands into packs, fill in template variables through forms, install pack-specific tools, and mirror terminal output directly into the browser.

**Local by design. Explicit authorization required. Review every command before execution.**

The interface is English-language and uses a plain HTML, CSS, and JavaScript frontend with a FastAPI backend. No Node.js build step or frontend CDN is required.

## Features

- Browse, search, and filter the included pack library. The home-screen pack and script counts are calculated from the packs currently loaded.
- Create, edit, import, export, and delete packs and scripts from the interface.
- Add a per-pack list of system packages. Install only the selected pack's packages using a detected `apt`, `dnf`, `pacman`, `zypper`, or `brew` manager. Installation is shown in a terminal and may require `sudo` (Homebrew does not use `sudo`).
- Run commands in a visible terminal, inspect mirrored output and exit status, and request a stop from the interface.
- Save reusable values such as `LHOST` or `INTERFACE`; matching script fields are prefilled by exact variable name.
- Optionally build a structured prompt for an external AI assistant. The prompt is generated locally, copied by the user, and never sent automatically.
- Review a responsible-use notice. Acknowledgment is required in the browser before running commands or installing packages.
- Export a pack as portable JSON and import it again by dropping the file into the sidebar.

## Requirements

- Python 3.10 or newer.
- Linux, macOS, or Windows.
- An internet connection on first launch so the launcher can install the Python requirements. Pack system tools are installed separately and only when requested.

## Install and Launch

Choose the launcher for the operating system you are currently using. The launcher creates a project-local `.venv`, installs or refreshes Python requirements when needed, selects an available localhost port, starts the server, and opens the browser. Keep its terminal window open while using MIDINS Forge; press Ctrl+C there to stop the server.

You do not need to uninstall Windows, install another operating system, or change your system setup to run MIDINS Forge. Use the matching launcher below.

### Windows

1. Install Python 3.10 or newer from [python.org](https://www.python.org/downloads/windows/). Enable **Add python.exe to PATH** in the installer.
2. Extract or clone the project folder.
3. Double-click `start_windows.bat`.
4. Keep the command window open. The launcher opens the local site in your browser.

Windows command execution uses a dedicated PowerShell window. The per-pack system package installer does not currently support Windows package managers; install Windows tools separately and review each command before running it.

### Linux

Install Python 3.10 or newer and its virtual-environment support. For Debian or Ubuntu:

```bash
sudo apt update
sudo apt install python3 python3-venv
```

For Fedora, install `python3` with `dnf`. For Arch Linux, install `python` with `pacman`.

Then make the launcher executable and run it:

```bash
chmod +x start_linux.sh
./start_linux.sh
```

You can also double-click `start_linux.sh` in a file manager configured to run executable text files. Some desktops ask whether to display, run, or run in a terminal; choose the run-in-terminal option.

### macOS

Install Python 3.10 or newer from [python.org](https://www.python.org/downloads/macos/) or with [Homebrew](https://brew.sh/). In Terminal, from the project directory, run:

```bash
chmod +x start_macos.command
./start_macos.command
```

After that, double-click `start_macos.command` to launch it. If macOS asks for confirmation, open it only if you trust the copy of the project you downloaded. The pack installer can use Homebrew when it is installed. Script execution uses the integrated output panel on macOS; a dedicated Terminal.app runner is not implemented yet.

### Manual Start

Create a virtual environment, install requirements, then run the backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py
```

On Windows PowerShell, use `py -m venv .venv`, `.venv\Scripts\Activate.ps1`, and then the same `python -m pip install -r requirements.txt` and `python main.py` commands. Manual start uses `http://127.0.0.1:8420` by default; the one-click launcher chooses a free local port if that port is busy.

## Using Packs

Expand a pack in the sidebar to see its scripts, configured package names, and actions. The **Install tools** button affects only that pack. Package names vary between distributions; MIDINS Forge maps several common names for supported package managers, but package availability is not guaranteed. Review the command in the terminal before confirming it. Add or edit package names in the pack editor.

The included OSINT pack installs only its own dependencies: system packages plus Sherlock and Shodan from PyPI, theHarvester from its upstream Git repository through `pipx`, and Amass/Subfinder from their upstream Go modules. Other packs use similar per-pack setup for tools such as Wifite and NetExec. First-time setup may take several minutes. Some scripts may still need API credentials or tools not managed by a pack. An exit code of `127` prompts you to review that pack's package list. Package names and availability vary by distribution; review the generated terminal command before confirming. On Arch-based systems, MIDINS Forge prefers `paru` or `yay` when installed for packages unavailable in official repositories; these helpers can build third-party AUR PKGBUILDs, which you should inspect before proceeding. Domain fields accept either a hostname or a full URL; a pasted URL is reduced to its hostname for WHOIS and DNS commands.

### Creating a Pack

Choose **+ New pack**, enter pack details, and add comma- or newline-separated system package names. Expand the pack and choose **+ Add script** to create a command template. Package lists are optional.

### Import and Export

Choose **Export JSON** on a pack to download its pack data, scripts, and dependency list. Drop an exported `.json` file into the sidebar to import it. Import validation checks required pack/script fields and dependency-name format.

### Pack JSON Format

```json
{
  "pack_id": "domain-osint",
  "pack_name": "Domain OSINT",
  "description": "Authorized domain inventory and DNS checks.",
  "color": "#38bdf8",
  "icon": "globe",
  "pack_tags": ["OSINT"],
  "dependencies": ["whois", "dnsutils"],
  "scripts": [
    {
      "id": "whois-lookup",
      "title": "WHOIS lookup",
      "category": "OSINT",
      "description": "Look up registration details for an authorized domain.",
      "template": "whois {{DOMAIN:example.com}}",
      "tags": ["whois", "domain"]
    }
  ]
}
```

`pack_name` and `scripts` are required. Each script needs a unique `id`, `title`, and `template`. `dependencies`, `pack_tags`, and script `tags` are optional lists. Dependency names must match the package identifiers used by the local package manager.

### Template Variables

`{{NAME}}` creates a text field. `{{NAME:default}}` creates the same field with a default value. If a reusable value has the exact same name, it prefills the field; the value can still be changed for the current command. Reusable values are stored in the local `config.json` file.

### Optional AI Prompt

The **Prompt** button opens a form for the pack name, theme, intended use, platform, packages, and script count. It only prepares copyable text. MIDINS Forge does not call an AI service or create a pack from the response. AI output can be inaccurate: verify JSON, commands, package names, authorization, and scope before importing or running it.

## ⚖️ Legal Notice & Responsible Use

MIDINS Forge is intended only for defensive security work, education, and authorized testing. Use it only on systems you own or have explicit written permission to assess, stay within the agreed scope, and comply with all applicable laws and regulations. Unauthorized scanning, exploitation, credential testing, persistence, or data access may be illegal.

The in-app acknowledgment records a browser preference; it does not grant authorization, provide legal advice, or guarantee legal protection. You are responsible for reviewing each imported pack, target, command, package installation, and result before proceeding. The software is provided **as is**, without warranty, and this notice is not a substitute for jurisdiction-specific legal advice or terms.

MIDINS Forge launches local commands with the privileges of the account running it. Package installation may use `sudo`. Inspect every command, target, and imported pack before use. This application has no authentication and is intended for local use only. Do not expose it to a shared or public network without adding appropriate authentication, authorization, and isolation.

## Project Layout

```text
midins-forge/
├── main.py              # FastAPI application, pack APIs, and command execution
├── launch.py            # Shared virtualenv bootstrap and local server launcher
├── packs_seed.py        # Seed library used when packs/ is empty
├── requirements.txt     # Python dependencies
├── start_windows.bat    # Windows double-click launcher
├── start_linux.sh       # Linux launcher
├── start_macos.command  # macOS Terminal launcher
├── LICENSE               # MIT license
├── packs/               # Pack JSON files
├── static/              # HTML, CSS, and JavaScript frontend
├── config.json          # Local values; generated at runtime and git-ignored
└── runtime_logs/        # Temporary command logs; git-ignored
```

The root `.gitignore` also excludes virtual environments and Python bytecode. Pack JSON files are kept in the repository so the included library can be shared. Review custom pack contents for secrets, private targets, and licensing before publishing.

## Platform Testing and Support

MIDINS Forge has been tested on Linux in the development environment. Windows and macOS launchers and code paths are included but have not been verified on those operating systems here. If you encounter a problem, open an issue in this GitHub repository's **Issues** tab and include your operating system/version, Python version, launcher used, and the error output. Remove passwords, API keys, private hostnames, and other sensitive information before posting logs.

## Development Checks

```bash
python -m py_compile main.py
node --check static/app.js
python -m json.tool packs/osint.json
```

There is no frontend build step. Run `python main.py` to start the local development server.

## 📄 License

MIDINS Forge is released under the [MIT License](LICENSE). You may use, modify, and redistribute it under the terms of that license. Third-party tools, scripts, pack contents, and dependencies may have their own licenses and terms; review them before redistribution.
