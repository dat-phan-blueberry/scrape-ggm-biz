require('@next/env').loadEnvConfig(process.cwd());
const { spawn } = require('node:child_process');
const child = spawn('deno', ['run', '--no-config', '--allow-net=127.0.0.1:3111,generativelanguage.googleapis.com:443', '--allow-env=GOOGLE_AI_STUDIO_API_KEY', 'tests/edge-server.ts'], { stdio: 'inherit', windowsHide: true });
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => child.kill());
child.on('exit', code => { process.exitCode = code || 0; });
