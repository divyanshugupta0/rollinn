import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localEnvPath = resolve(root, '.env.local');
let localEnv = {};
try {
  const localEnvText = await readFile(localEnvPath, 'utf8');
  localEnv = Object.fromEntries(localEnvText.split(/\r?\n/)
    .map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, key, rawValue]) => [key, rawValue.replace(/^(['"])(.*)\1$/, '$2').trim()]));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const variables = {
  apiKey: 'FIREBASE_API_KEY',
  authDomain: 'FIREBASE_AUTH_DOMAIN',
  databaseURL: 'FIREBASE_DATABASE_URL',
  projectId: 'FIREBASE_PROJECT_ID',
  storageBucket: 'FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'FIREBASE_MESSAGING_SENDER_ID',
  appId: 'FIREBASE_APP_ID',
  measurementId: 'FIREBASE_MEASUREMENT_ID'
};

const config = Object.fromEntries(Object.entries(variables)
  .map(([key, envName]) => [
    key,
    process.env[envName]?.trim() || localEnv[envName] || ''
  ])
  .filter(([, value]) => value));

config.profileUploadWorkerUrl = process.env.PROFILE_UPLOAD_WORKER_URL?.trim() ||
  localEnv.PROFILE_UPLOAD_WORKER_URL ||
  'https://rollcall-worker.divyanshugupta415.workers.dev/';
config.profilePhotoPublicBaseUrl = process.env.PROFILE_PHOTO_PUBLIC_BASE_URL?.trim() ||
  localEnv.PROFILE_PHOTO_PUBLIC_BASE_URL ||
  'https://rollcall-worker.divyanshugupta415.workers.dev/file';

const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const missing = required.filter(key => !config[key]);
if (missing.length) {
  const names = missing.map(key => variables[key]).join(', ');
  throw new Error(`Missing required Firebase deployment variables: ${names}`);
}

const outputPath = resolve(root, 'auth/firebase-config.runtime.js');
const source = `// Generated during deployment from FIREBASE_* environment variables. Do not edit or commit.\n` +
  `window.ROLLCALL_FIREBASE_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source, 'utf8');
console.log(`Generated shared Firebase runtime config at ${outputPath}`);
