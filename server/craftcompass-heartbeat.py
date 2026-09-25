#!/usr/bin/env python3
import json
import os
import shutil
import socket
import subprocess
import time
import urllib.request

ENDPOINT = os.environ.get("CRAFTCOMPASS_HEARTBEAT_URL", "https://app.craftcompassai.com/api/infrastructure/heartbeat")
TOKEN = os.environ.get("CRAFTCOMPASS_HEARTBEAT_TOKEN", "").strip()
AGENT_VERSION = "1"

def service_active(name: str):
    try:
        result = subprocess.run(
            ["systemctl", "is-active", "--quiet", name],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return result.returncode == 0
    except Exception:
        return None

def read_uptime_seconds():
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as f:
            return float(f.read().split()[0])
    except Exception:
        return None

def read_memory_mb():
    try:
        values = {}
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                key, raw = line.split(":", 1)
                values[key] = int(raw.strip().split()[0])
        total_kb = values.get("MemTotal")
        available_kb = values.get("MemAvailable")
        if total_kb is None or available_kb is None:
            return None, None
        used_kb = total_kb - available_kb
        return round(used_kb / 1024, 1), round(total_kb / 1024, 1)
    except Exception:
        return None, None

def read_cpu_percent():
    try:
        cpu_count = os.cpu_count() or 1
        load_1m = os.getloadavg()[0]
        return round(min(100.0, max(0.0, (load_1m / cpu_count) * 100.0)), 1)
    except Exception:
        return None

def read_temperature_c():
    candidates = [
        "/sys/class/thermal/thermal_zone0/temp",
        "/sys/class/hwmon/hwmon0/temp1_input",
    ]
    for path in candidates:
        try:
            with open(path, "r", encoding="utf-8") as f:
                value = float(f.read().strip())
            if value > 1000:
                value /= 1000.0
            if -20 <= value <= 150:
                return round(value, 1)
        except Exception:
            pass
    return None

def main():
    if not TOKEN:
        raise SystemExit("CRAFTCOMPASS_HEARTBEAT_TOKEN is not configured")

    memory_used_mb, memory_total_mb = read_memory_mb()
    disk = shutil.disk_usage("/")

    payload = {
        "hostname": socket.gethostname(),
        "uptime_seconds": read_uptime_seconds(),
        "memory_used_mb": memory_used_mb,
        "memory_total_mb": memory_total_mb,
        "storage_used_gb": round((disk.total - disk.free) / (1024 ** 3), 1),
        "storage_total_gb": round(disk.total / (1024 ** 3), 1),
        "storage_free_gb": round(disk.free / (1024 ** 3), 1),
        "cpu_percent": read_cpu_percent(),
        "temperature_c": read_temperature_c(),
        "web_server_active": service_active("nginx"),
        "dashboard_api_active": service_active("tradewise-dashboard.service"),
        "agent_version": AGENT_VERSION,
    }

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "CraftCompassHeartbeat/1",
        },
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"Heartbeat returned HTTP {response.status}")

if __name__ == "__main__":
    main()
