# Using PM2

PM2 is the process supervisor that keeps `rentalzen-server` and `rentalzen-client` running across crashes, reboots, and idle disconnects. This doc covers the day-to-day commands and explains what the `env` blocks in the ecosystem file actually do.

## Files

- **`~/repos/apps/ecosystem.config.js`** — the **real** file on the Ubuntu host. Sits in the parent of `rz-server` and `rz-client` because PM2 manages both apps together.
- **`<repo>/ecosystem.config.cjs`** — a checked-in copy/template for reference. Edit and copy out to `~/repos/apps/` when changing the deployed config.
- **`<repo>/ecosystem.config.windows.cjs`** — Windows companion (uses `.cmd` shims and Windows paths). Not normally used; the Windows machine is a dev box.

## Day-to-day commands

```bash
# Start everything in the ecosystem file (uses the default `env` block)
pm2 start ~/repos/apps/ecosystem.config.js

# Start with the production env block applied
pm2 start ~/repos/apps/ecosystem.config.js --env production

# See what's running
pm2 status                  # quick table
pm2 list                    # same thing
pm2 info rentalzen-server   # full detail for one app (pid, restarts, uptime, log paths)

# Stop / restart / reload
pm2 stop rentalzen-server
pm2 restart rentalzen-server                       # hard restart, preserves prior env
pm2 restart rentalzen-server --update-env          # hard restart and re-read env from ecosystem file
pm2 reload rentalzen-server                        # zero-downtime reload (cluster mode only)
pm2 delete rentalzen-server                        # remove from PM2 entirely

# Restart everything in the ecosystem file
pm2 restart ~/repos/apps/ecosystem.config.js

# Reset the restart counter after fixing whatever was crashing
pm2 reset rentalzen-server
```
Mental model: `pm2 save` is the equivalent of git commit for PM2's process list. The startup unit is git checkout at boot. If you didn't commit, the change doesn't survive.



Subtle gotcha
If you pm2 stop an app and then edit the ecosystem file, pm2 restart <app> uses the cached config, not the file. To re-read the file you need pm2 restart <app> --update-env (for env only) or pm2 delete <app> followed by pm2 start ecosystem.config.cjs (for cwd, script, args, etc. — those aren't covered by --update-env).


## Logs

```bash
pm2 logs                              # tail combined stdout+stderr for all apps
pm2 logs rentalzen-server             # tail one app
pm2 logs rentalzen-server --lines 200 # last 200 lines, then tail
pm2 logs --err                        # stderr only
pm2 logs --out                        # stdout only
pm2 flush                             # truncate all log files

# Default log file locations (Linux):
#   ~/.pm2/logs/<app>-out.log
#   ~/.pm2/logs/<app>-error.log
#   ~/.pm2/pm2.log              (PM2's own log)

pm2 monit                             # interactive TUI: CPU, mem, live logs per app
```

## Boot persistence

PM2 doesn't survive a reboot unless you tell it to:

```bash
pm2 start ~/repos/apps/ecosystem.config.js  # start the apps
pm2 save                                     # snapshot the current process list
pm2 startup systemd                          # prints a `sudo` command — run it
                                             # to install a systemd unit that
                                             # restores the saved list on boot

# After any change to the running set, re-snapshot:
pm2 save
```

On Windows, the equivalent is `pm2-windows-startup install` from a global install of `pm2-windows-startup`.

## What the `env` blocks do

```js
env: {
  NODE_ENV: 'development',
},
env_production: {
  NODE_ENV: 'production',
},
```

These define **named environment sets** that PM2 merges into `process.env` for the spawned app. They are not magic — PM2 just picks one based on the `--env <name>` flag at start/restart time.

- **`env`** is the **default**. Applied when you run `pm2 start ecosystem.config.cjs` with no `--env` flag. The vars inside are set on `process.env` for the app process.
- **`env_production`** is applied when you pass `--env production`: `pm2 start ecosystem.config.cjs --env production`. The naming convention is `env_<name>` — you can add as many as you want (`env_staging`, `env_local`, `env_qa`, etc.) and select with `--env <name>`.

A few things worth knowing:

- `env_production` does **not** automatically merge with `env`. When you pass `--env production`, the `env_production` block alone is applied (plus the shell's existing env). If you want shared vars across both, repeat them in each block, or set them in the shell before launching PM2.
- The selected env is **frozen at start time**. Editing the ecosystem file and running `pm2 restart <app>` will *not* pick up changes — restart preserves the env that was active when the app was first started. To re-read the file you must pass `--update-env`:
  ```bash
  pm2 restart rentalzen-server --update-env
  pm2 restart ~/repos/apps/ecosystem.config.js --env production --update-env
  ```
- These blocks are not a substitute for `.env` files. They're meant for a handful of orchestration-level vars (`NODE_ENV`, ports, feature flags). Secrets and per-host config still belong in `.env` and are loaded by the app via `dotenv` as usual.
- In the current config, both apps are started with `NODE_ENV` set, but `rentalzen-client` only has an `env` block (no `env_production`), so passing `--env production` simply means PM2 applies the per-app env it has — `development` for the server, `production` for the client — unless you also add `env_production` to the client.

## Quick reference

| Goal | Command |
|---|---|
| Start everything (default env) | `pm2 start ~/repos/apps/ecosystem.config.js` |
| Start everything (production env) | `pm2 start ~/repos/apps/ecosystem.config.js --env production` |
| Status | `pm2 status` |
| Detail for one app | `pm2 info rentalzen-server` |
| Tail logs (all) | `pm2 logs` |
| Tail logs (one app) | `pm2 logs rentalzen-server` |
| Restart picking up env changes | `pm2 restart <app> --update-env` |
| Live TUI | `pm2 monit` |
| Persist across reboot | `pm2 save && pm2 startup systemd` |
