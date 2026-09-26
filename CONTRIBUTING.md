# Contributing

Thanks for helping improve MIDINS Forge.

## Before opening an issue

- Search existing issues for the same problem.
- Include your operating system/version, Python version, launcher, steps to reproduce, and relevant error output.
- Remove API keys, passwords, personal information, private hostnames, and other sensitive data from logs.
- State whether the issue reproduces on the latest version.

## Changes

- Keep changes focused and consistent with the existing Python and vanilla JavaScript code.
- Do not include local `config.json`, virtual environments, runtime logs, credentials, or private targets.
- Validate Python with `python -m py_compile main.py launch.py`.
- Validate JavaScript with `node --check static/app.js`.
- Validate pack JSON with `python -m json.tool packs/<pack-name>.json`.
- Test only against systems you own or are explicitly authorized to assess.

## Pull requests

Describe the user-visible behavior, platforms tested, and any limitations. Do not claim Windows or macOS testing unless the change was run on those systems.
