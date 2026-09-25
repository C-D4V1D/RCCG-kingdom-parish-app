// Shared by the route tests: Finance routes now need a signed token
// (see FINANCE APP AUTH in functions/api/[[route]].js). This seeds the
// isolate's key cache — exactly what happens after the first D1 read in
// production — and signs an IT-admin token that every test request can carry.
import { __authTesting } from '../functions/api/[[route]].js';

export const TEST_SIGNING_KEY = 'test-finance-signing-key';
export const TEST_AUTOMATION_KEY = 'test-automation-key';
__authTesting.setAppSecrets({ signing: TEST_SIGNING_KEY, automation: TEST_AUTOMATION_KEY });

export function financeToken({ uid = 'u1', role = 'it_admin', storedPin = 'sha256$test', ...rest } = {}) {
  return __authTesting.signFinanceToken(TEST_SIGNING_KEY, { uid, role, storedPin, ...rest });
}

export const FINANCE_TOKEN = await financeToken();
export const FINANCE_AUTH_HEADER = Object.freeze({ Authorization: `Bearer ${FINANCE_TOKEN}` });
