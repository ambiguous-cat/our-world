// Replace cwd with your own application directory before starting PM2.
module.exports = {
  apps: [
    {
      name: "our-world",
      cwd: "/srv/our-world",
      script: "./node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3005",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
