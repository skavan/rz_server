module.exports = {
  apps: [
    {
      name: 'rentalzen-server',
      cwd: '/home/suresh/repos/apps/rentalzen/rz-server/server',
      script: 'npm',
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
      cwd: '/home/suresh/repos/apps/rentalzen/rz-client',
      script: 'pnpm',
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