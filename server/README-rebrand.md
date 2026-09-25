# CraftCompass server operational rename

Use `rebrand-to-craftcompass.sh` for the first safe server-side rename.

It changes the visible hostname from `tradewise-server` to `craftcompass-server`, updates common dashboard HTML branding when present, and migrates the legacy backup folder with a compatibility symlink.

It intentionally leaves old systemd unit names and other machine identifiers alone during phase 1. Those identifiers are not customer-facing and may be referenced by existing monitoring or service dependencies.

## Run

```bash
sudo bash server/rebrand-to-craftcompass.sh
```

Afterward, the preferred LAN name is:

```
http://craftcompass-server.local/dashboard.html
```

The old `.local` hostname may stop resolving after the hostname change. Update bookmarks accordingly.
