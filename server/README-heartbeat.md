# CraftCompass home-server heartbeat

This lightweight agent sends an outbound health snapshot from the Linux home server to CraftCompass AI every five minutes.

It does not open an inbound port on the home network and uses only Python's standard library.

## Install

1. In Platform Admin -> System Health -> Home server, generate a setup token.
2. Copy `server/craftcompass-heartbeat.py` to `/usr/local/bin/craftcompass-heartbeat`.
3. Make it executable: `sudo chmod 755 /usr/local/bin/craftcompass-heartbeat`.
4. Create `/etc/craftcompass-heartbeat.env`:

```
CRAFTCOMPASS_HEARTBEAT_TOKEN=<one-time token from Platform Admin>
CRAFTCOMPASS_HEARTBEAT_URL=https://app.craftcompassai.com/api/infrastructure/heartbeat
```

5. Protect the env file: `sudo chmod 600 /etc/craftcompass-heartbeat.env`.
6. Copy the service and timer files to `/etc/systemd/system/`.
7. Run:

```
sudo systemctl daemon-reload
sudo systemctl enable --now craftcompass-heartbeat.timer
sudo systemctl start craftcompass-heartbeat.service
systemctl status craftcompass-heartbeat.timer --no-pager
```

The System Health page should show ONLINE after the first successful heartbeat.
