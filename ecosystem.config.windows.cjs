// Windows dev-box companion to ecosystem.config.cjs.
// Mirrors the Linux config but with Windows paths and the .cmd shims PM2
// needs to spawn npm/pnpm on Windows. Adjust `cwd` paths to match this host.

module.exports = {
  apps: [
    {
      name: 'rentalzen-server',
      cwd: 'G:\\Documents\\Code 2025\\repos\\rz_server\\server',
      script: 'npm.cmd',
      args: 'start',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',
      watch: false,
      autorestart: true,
    },
    {
      name: 'rentalzen-client',
      cwd: 'G:\\Documents\\Code 2025\\repos\\rz_client',
      script: 'pnpm.cmd',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '2G',
      watch: false,
      autorestart: true,
    },
  ],
};
