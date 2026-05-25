# Ubuntu Setup Guide (rz_server)

This guide is for running the server on Ubuntu with stable media uploads.

## 1. System prerequisites

```bash
sudo apt update
sudo apt install -y curl git build-essential
```

Install Node.js 20 LTS (recommended):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 2. Clone and install

```bash
git clone <your-repo-url> rz_server
cd rz_server/server
npm ci
```

## 3. Environment configuration

Start from your current settings but make Linux-safe path values explicit.

For multi-instance deployments that should share uploads, point every server to the same shared storage dataset (outside this repo).
In mixed OS environments, mount the same network share to an OS-appropriate local path.

Recommended `.env` values:

```dotenv
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
UPLOAD_DIR=/srv/rz-data/shared/media
MEDIA_EXPORT_PATH=/srv/rz-data/shared/media-exports
```

Notes:
- `UPLOAD_DIR` may also be relative (for example `./uploads`), but production should use absolute external paths.
- The server now rejects Windows-style paths on non-Windows hosts to fail fast with a clear error.

### Shared path layout (same dataset across servers)

```text
Shared dataset (single source of media):
  /srv/rz-data/shared/media/           (Ubuntu mount point)
  D:\rz-data\shared\media\            (Windows mount point)

Optional export output:
  /srv/rz-data/shared/media-exports/
  D:\rz-data\shared\media-exports\
```

The path string can differ by OS; the important part is all servers target the same underlying storage.

## 4. Create media directories and permissions

Create a dedicated service account and media directories:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin rzserver || true
sudo mkdir -p /srv/rz-data/shared/media
sudo mkdir -p /srv/rz-data/shared/media-exports
sudo chown -R rzserver:rzserver /srv/rz-data/shared
sudo chmod -R 750 /srv/rz-data/shared
```

## 5. Build and smoke test

```bash
cd /path/to/rz_server/server
npm run build
npm start
```

Health check:

```bash
curl http://127.0.0.1:5000/health
```

## 6. Run with systemd

Create `/etc/systemd/system/rz-server.service`:

```ini
[Unit]
Description=rz_server API
After=network.target

[Service]
Type=simple
User=rzserver
Group=rzserver
WorkingDirectory=/opt/rz_server/server
Environment=NODE_ENV=production
EnvironmentFile=/opt/rz_server/server/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable rz-server
sudo systemctl start rz-server
sudo systemctl status rz-server
```

## 7. Upload strategy (recommended)

Use a shared storage target for uploads so all servers read/write the same media set.

### Why this strategy
- Fast writes for API requests.
- Fewer runtime failures than direct network mounts.
- Clear recovery and backup workflows.

### Recommended design
1. Primary upload storage: shared filesystem path (for example `/srv/rz-data/shared/media`).
2. Nightly backup: snapshot + sync to object storage or remote host.
3. Optional: keep exports in separate shared path (`media-exports`).
4. Retention policy:
   - Hot local media: full set.
   - Backup target: versioned snapshots for 30-90 days.

### Example backup script

Create `/usr/local/bin/rz-media-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SRC=/srv/rz-data/shared/media/
DEST=/mnt/backups/rz_server/shared/media/

rsync -a --delete "$SRC" "$DEST"
```

Then run from cron/systemd timer.

### Operational guardrails
- Monitor free space and IO on the shared storage root (for example `/srv/rz-data/shared`).
- Alert if backup job fails.
- Test restore quarterly.
- Keep uploads path outside repo checkout.

## 8. Migration from Windows path usage

If your current media lives on Windows/OneDrive:
1. Copy media directory to Ubuntu path (preserving folder structure under `customers/...`).
2. Set `UPLOAD_DIR` to the shared Linux mount path.
3. Restart the service.
4. Validate media fetch and PDF generation.

## 9. Quick troubleshooting

- Error: Windows-style path detected on Linux
  - Fix `UPLOAD_DIR` or `MEDIA_EXPORT_PATH` to use Linux path format.
- 404 on media
  - Confirm file exists under `UPLOAD_DIR` and service user can read it.
- Upload fails with permission denied
  - Recheck owner/group and directory permissions.

## 10. Shared Storage Checklist (Ubuntu + Windows)

Use this if multiple servers (some Ubuntu, some Windows) must share one upload dataset.

### A. Mount consistency

1. Mount the same network share on every host.
2. Use host-native mount paths:
   - Ubuntu: `/srv/rz-data/shared/media`
   - Windows: `D:\rz-data\shared\media`
3. Set `UPLOAD_DIR` per host to its local mount path (same underlying share).

### B. Permissions

1. Ensure the service identity on each host has read/write/delete rights on the share.
2. Keep one ownership model on the share (avoid mixed ad-hoc ACLs).
3. Test from both hosts:
   - create file
   - rename file
   - delete file

### C. Filename and path safety

1. Prefer lowercase and normalized names (already done by server upload storage).
2. Avoid names that differ only by case (`Photo.jpg` vs `photo.jpg`).
3. Avoid OS-reserved names and special characters in manual file operations.

### D. Case sensitivity caution

Windows is case-insensitive by default; Linux is case-sensitive.
Do not manually create files whose names only differ by case, or cross-host behavior can diverge.

### E. Locking and latency

1. Expect slightly higher latency on network storage than local disk.
2. Keep mount options stable and test concurrent uploads from two hosts.
3. If you see transient file errors, check SMB/NFS server logs first.

### F. Monitoring and backup

1. Monitor free space on the shared volume.
2. Alert on share disconnects/mount failures.
3. Back up the shared media dataset separately from PostgreSQL backups.

### G. Smoke test before go-live

From Ubuntu and Windows separately:
1. Upload media through API.
2. Fetch/preview media from API.
3. Generate PDF containing media.
4. Verify both hosts can read newly written files from the other host.
