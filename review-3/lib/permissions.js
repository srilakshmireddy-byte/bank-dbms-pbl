'use strict';
// Single source of truth for role-based access. The UI receives the list for the logged-in role from /api/auth/me.
const T = 'TELLER', L = 'LOAN_OFFICER', M = 'MANAGER';

const PERMISSIONS = {
  'dashboard:view':      [T, L, M],
  'customers:view':      [T, L, M],
  'customers:write':     [T, M],
  'accounts:view':       [T, L, M],
  'accounts:create':     [T, M],
  'accounts:status':     [M],
  'transactions:post':   [T, M],
  'transactions:recent': [T, L, M],
  'audit:view':          [M],
  'transfers:view':      [T, L, M],
  'transfers:create':    [T, M],
  'beneficiaries:write': [T, M],
  'statements:view':     [T, L, M],
  'loans:view':          [T, L, M],
  'loans:create':        [L, M],
  'loans:repay':         [T, L, M],
  'branches:view':       [T, L, M],
  'ruletester:run':      [T, L, M],
};

const ROLES = [T, L, M];
const can = (role, perm) => (PERMISSIONS[perm] || []).includes(role);
const permissionsFor = (role) => Object.keys(PERMISSIONS).filter((p) => can(role, p));

module.exports = { PERMISSIONS, ROLES, can, permissionsFor };
