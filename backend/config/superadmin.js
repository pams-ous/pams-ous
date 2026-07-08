// Super‑admin configuration — all values come from .env
const requiredEnv = [
  'SUPERADMIN_EMAIL',
  'SUPERADMIN_PASSWORD',
  'SUPERADMIN_EMPLOYEE_CODE',
  'SUPERADMIN_FIRST_NAME',
  'SUPERADMIN_LAST_NAME',
  'SUPERADMIN_JOB_TITLE',
];
const missing = requiredEnv.filter(v => !process.env[v]);
if (missing.length) {
  console.error(`Missing required super‑admin env vars: ${missing.join(', ')}`);
  console.error('Set them in .env before starting the server.');
  process.exit(1);
}

module.exports = {
  EMAIL: process.env.SUPERADMIN_EMAIL,
  PASSWORD: process.env.SUPERADMIN_PASSWORD,
  EMPLOYEE_CODE: process.env.SUPERADMIN_EMPLOYEE_CODE,
  FIRST_NAME: process.env.SUPERADMIN_FIRST_NAME,
  LAST_NAME: process.env.SUPERADMIN_LAST_NAME,
  JOB_TITLE: process.env.SUPERADMIN_JOB_TITLE,
};
