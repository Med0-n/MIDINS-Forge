"""Bootstrap the local environment and start MIDINS Forge."""

import hashlib
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
VENV_DIR = BASE_DIR / ".venv"
REQUIREMENTS_FILE = BASE_DIR / "requirements.txt"


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def prepare_environment() -> Path:
    if sys.version_info < (3, 10):
        raise RuntimeError("Python 3.10 or newer is required. Install it and run this launcher again.")

    python = venv_python()
    if not python.exists():
        print("Creating the MIDINS Forge virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", str(VENV_DIR)], check=True, cwd=BASE_DIR)

    requirements_hash = hashlib.sha256(REQUIREMENTS_FILE.read_bytes()).hexdigest()
    marker = VENV_DIR / ".requirements-sha256"
    if not marker.exists() or marker.read_text(encoding="utf-8").strip() != requirements_hash:
        print("Installing or updating Python dependencies...")
        subprocess.run(
            [str(python), "-m", "pip", "install", "-r", str(REQUIREMENTS_FILE)],
            check=True,
            cwd=BASE_DIR,
        )
        marker.write_text(requirements_hash, encoding="utf-8")
    return python


def available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def wait_until_ready(process: subprocess.Popen, url: str) -> bool:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(url, timeout=1):
                return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.25)
    return False


def main() -> int:
    try:
        python = prepare_environment()
        port = available_port()
        url = f"http://127.0.0.1:{port}"
        environment = os.environ.copy()
        environment["MIDINS_HOST"] = "127.0.0.1"
        environment["MIDINS_PORT"] = str(port)
        process = subprocess.Popen([str(python), str(BASE_DIR / "main.py")], cwd=BASE_DIR, env=environment)

        if not wait_until_ready(process, url):
            if process.poll() is None:
                process.terminate()
                process.wait()
            raise RuntimeError("MIDINS Forge did not start. Check the messages above for details.")

        print(f"MIDINS Forge is running at {url}")
        print("Keep this window open while using the app. Press Ctrl+C to stop it.")
        webbrowser.open(url)
        try:
            return process.wait()
        except KeyboardInterrupt:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            print("\nMIDINS Forge stopped.")
            return 130
    except KeyboardInterrupt:
        print("\nStopping MIDINS Forge...")
        return 130
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"\nMIDINS Forge could not start: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())