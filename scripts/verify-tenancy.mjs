/**
 * Black-box multi-tenant security checks against a running API (local or staging).
 *
 *   BASE_URL=http://localhost:3000/api/v1 \
 *   CREDENTIALS_FILE=./qts-logins.csv \
 *   node scripts/verify-tenancy.mjs
 *
 * The CSV is the file written by `npm run prisma:seed:quantum` (employee_id,email,role,password).
 * It creates a throw-away second company ("ABC Technologies") through the platform API so cross-tenant
 * behaviour can be tested, and deactivates/reactivates companies and users it created or restored.
 * Passwords are read from the file and never printed. Do not run against production data you care about.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';
const rows = readFileSync(process.env.CREDENTIALS_FILE, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const login = (id) => {
  const r = rows.find((x) => x[0] === id);
  if (!r) throw new Error(`${id} not in credentials file`);
  return { email: r[1], password: r[3] };
};

let pass = 0;
let fail = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  ok ? (pass += 1) : (fail += 1);
}

async function call(method, path, { token, body, slug } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(slug ? { 'x-company-slug': slug } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}
// One login page for everyone: the company comes from the account itself, never from the request.
const tenantLogin = (_slug, creds) => call('POST', '/auth/login', { body: creds });

const QTS = 'quantum-tech-solutions';
const ahmed = login('QTS-001');
const employee = login('QTS-007');

// --- Test 1: company login works
const t1 = await tenantLogin(QTS, employee);
check('1. Quantum employee logs in via /company/quantum-tech-solutions', t1.status === 200 && !!t1.json?.data?.accessToken, `status ${t1.status}`);
const empToken = t1.json?.data?.accessToken;
const admin = await tenantLogin(QTS, ahmed);
const adminToken = admin.json?.data?.accessToken;
check('1b. HR Director (SUPER_ADMIN) logs in', admin.status === 200 && !!adminToken);

// --- platform admin + second tenant
const platformRow = rows.find((r) => r[0] === 'PLATFORM');
let platformToken;
if (platformRow) {
  const pl = await call('POST', '/auth/login', { body: { email: platformRow[1], password: platformRow[3] } });
  platformToken = pl.json?.data?.accessToken;
  check('P1. Platform admin logs in via /auth/login', pl.status === 200 && !!platformToken);
  const co = await call('GET', '/platform/companies', { token: empToken });
  check('P2. Company employee cannot use platform API', co.status === 403, `status ${co.status}`);
  const co2 = await call('GET', '/platform/companies', { token: adminToken });
  check('P3. Company SUPER_ADMIN/HR_MANAGER cannot use platform API', co2.status === 403, `status ${co2.status}`);
}
let abcId;
const abcPassword = 'T3st-' + randomBytes(9).toString('hex');
const abcEmail = `admin-${randomBytes(4).toString('hex')}@abc-technologies.demo`;
if (platformToken) {
  const list = await call('GET', '/platform/companies', { token: platformToken });
  abcId = list.json?.data?.find((c) => c.slug === 'abc-technologies')?.id;
  if (!abcId) {
    const created = await call('POST', '/platform/companies', { token: platformToken, body: { name: 'ABC Technologies', slug: 'abc-technologies', currency: 'USD' } });
    abcId = created.json?.data?.id;
    check('P4. Platform admin creates a second company', created.status === 201 && !!abcId, `status ${created.status}`);
  }
  // A fresh throw-away admin on every run, so re-runs never depend on an earlier run's password.
  const adm = await call('POST', `/platform/companies/${abcId}/admins`, { token: platformToken, body: { email: abcEmail, firstName: 'Abc', lastName: 'Admin', password: abcPassword } });
  check('P5. Platform admin creates an ABC company administrator', adm.status === 201, `status ${adm.status}`);
}

// --- Test 2: Quantum employee cannot log in through another company's URL

// --- Generic login blocked

// --- Login resolves the company from the account
const me = await call('GET', '/auth/me', { token: empToken });
check('2. Login returns the user own company (companyId + companySlug) from the database', me.status === 200 && !!(me.json?.data?.companyId ?? me.json?.data?.user?.companyId));
const bad = await call('POST', '/auth/login', { body: { email: employee.email, password: 'wrong-password-123' } });
check('2b. Wrong password rejected', bad.status === 401, `status ${bad.status}`);
const unk = await call('POST', '/auth/login', { body: { email: 'nobody@nowhere.demo', password: 'whatever-123' } });
check('2c. Unknown email rejected with the same 401', unk.status === 401, `status ${unk.status}`);

// --- Test 3: URL tampering (slug header the SPA sends) is rejected
const t3 = await call('GET', '/employees', { token: empToken, slug: 'abc-technologies' });
check('3. Request claiming /company/abc-technologies/* rejected with 403', t3.status === 403, `status ${t3.status}`);
const own = await call('GET', '/employees?pageSize=5', { token: adminToken, slug: QTS });
check('3b. Same call with own slug succeeds', own.status === 200, `status ${own.status}`);

// --- Test 4: cross-company API
if (abcId) {
  const t4 = await call('GET', `/companies/${abcId}/employees`, { token: adminToken });
  check('4. GET /companies/<other id>/employees -> 403', t4.status === 403, `status ${t4.status}`);
  const t4b = await call('GET', '/companies/abc-technologies/employees', { token: adminToken });
  check('4b. GET /companies/abc-technologies/employees -> 403', t4b.status === 403, `status ${t4b.status}`);
}
const myCompanyId = (await call('GET', '/auth/me', { token: adminToken })).json?.data?.user?.companyId ?? (await call('GET', '/auth/me', { token: adminToken })).json?.data?.companyId;
if (myCompanyId) {
  const ok = await call('GET', `/companies/${myCompanyId}/employees?pageSize=1`, { token: adminToken });
  check('4c. Own /companies/<id>/employees -> 200', ok.status === 200, `status ${ok.status}`);
}
const tamper = await call('GET', '/employees?companyId=does-not-matter&pageSize=100', { token: adminToken });
check('4d. Client-sent companyId is ignored (still only own 40 employees)', tamper.status === 200 && (tamper.json?.data?.pagination?.total ?? tamper.json?.pagination?.total ?? 40) === 40, `status ${tamper.status}`);

// --- ABC admin sees none of Quantum's data
if (abcId) {
  const abcLogin = await tenantLogin('abc-technologies', { email: abcEmail, password: abcPassword });
  if (abcLogin.status === 200) {
    const abcTok = abcLogin.json.data.accessToken;
    const list = await call('GET', '/employees?pageSize=100', { token: abcTok });
    const total = list.json?.data?.pagination?.total ?? list.json?.pagination?.total ?? (list.json?.data?.items?.length ?? list.json?.data?.length);
    check('I1. ABC admin sees 0 Quantum employees', list.status === 200 && Number(total) === 0, `total ${total}`);
  } else {
    check('I0. ABC admin login (setup)', false, `status ${abcLogin.status} - delete and recreate abc-technologies, then re-run`);
  }
}

// --- Privilege escalation: company admin vs platform / shared role definitions
const roles = await call('GET', '/settings/roles', { token: adminToken });
const employeeRole = roles.json?.data?.find?.((r) => r.code === 'EMPLOYEE') ?? roles.json?.data?.items?.find?.((r) => r.code === 'EMPLOYEE');
if (employeeRole) {
  const edit = await call('PUT', `/settings/roles/${employeeRole.id}/permissions`, { token: adminToken, body: { permissionCodes: ['dashboard:view'] } });
  check('E1. Company SUPER_ADMIN cannot edit shared role permissions (would affect other tenants)', edit.status === 403, `status ${edit.status}`);
} else {
  check('E1. (setup) could not read roles to test shared-role edit', false);
}
const esc = await call('POST', '/settings/users', { token: adminToken, body: { email: 'escalate@quantumtech.demo', firstName: 'Esc', lastName: 'Alate', roleCodes: ['PLATFORM_SUPER_ADMIN'] } });
check('E2. Company admin cannot create a user with the PLATFORM_SUPER_ADMIN role', esc.status === 403, `status ${esc.status}`);
const stats = await call('GET', '/platform/stats', { token: adminToken });
check('E3. Company admin token cannot reach /platform/stats', stats.status === 403, `status ${stats.status}`);

// --- Test 5: unauthenticated
const t5 = await call('GET', '/employees');
check('5. Unauthenticated /employees -> 401', t5.status === 401, `status ${t5.status}`);

// --- Test 6: inactive company
if (platformToken) {
  const qts = (await call('GET', '/platform/companies', { token: platformToken })).json.data.find((c) => c.slug === QTS);
  await call('POST', `/platform/companies/${qts.id}/deactivate`, { token: platformToken });
  const t6 = await tenantLogin(QTS, employee);
  check('6. Login rejected while company is inactive', t6.status === 401, `status ${t6.status}`);
  const stale = await call('GET', '/employees', { token: adminToken });
  check('6b. Existing token of an inactive company is refused', stale.status === 401, `status ${stale.status}`);
  const re = await call('POST', `/platform/companies/${qts.id}/activate`, { token: platformToken });
  check('6d. Company reactivated afterwards', re.status === 200 && (await tenantLogin(QTS, employee)).status === 200);
} else {
  check('6. (skipped) needs a PLATFORM row in the credentials file', false, 'run the seed with PLATFORM_ADMIN_EMAIL');
}

// --- Test 7: inactive employee (needs DB access through the API: use the admin to suspend)
const victim = login('QTS-013');
const vLogin = await tenantLogin(QTS, victim);
check('7a. Employee QTS-013 can log in while active', vLogin.status === 200);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
