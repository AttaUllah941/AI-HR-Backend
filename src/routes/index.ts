import { Router } from 'express';
import { validateQuery } from '../middleware/validate.middleware.js';
import { paginationQuerySchema } from '../validators/pagination.validators.js';
import { aiRouter } from '../modules/ai/ai.routes.js';
import { attendanceRouter } from '../modules/attendance/attendance.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { employeesRouter } from '../modules/employees/employees.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { leaveRouter } from '../modules/leave/leave.routes.js';
import { organizationRouter } from '../modules/organization/organization.routes.js';
import { payrollRouter } from '../modules/payroll/payroll.routes.js';
import { performanceRouter } from '../modules/performance/performance.routes.js';
import { recruitmentRouter } from '../modules/recruitment/recruitment.routes.js';
import { reportsRouter } from '../modules/reports/reports.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';
import { profileRouter } from '../modules/profile/profile.routes.js';
import { settingsRouter } from '../modules/settings/settings.routes.js';
import { filesRouter } from '../modules/files/files.routes.js';
import { globalRouter } from '../modules/global/global.routes.js';
import { securityRouter } from '../modules/security/security.routes.js';

export const apiRouter = Router();

// One shared rule for every list endpoint: page >= 1 and pageSize <= 100 (other params pass through).
apiRouter.use(validateQuery(paginationQuerySchema.loose()));

/** Every module router and where it is mounted (also used to generate the OpenAPI document). */
export const API_MOUNTS: ReadonlyArray<readonly [string, Router]> = [
  ['/health', healthRouter],
  ['/auth', authRouter],
  ['/dashboard', dashboardRouter],
  ['/organization', organizationRouter],
  ['/employees', employeesRouter],
  ['/attendance', attendanceRouter],
  ['/leave', leaveRouter],
  ['/payroll', payrollRouter],
  ['/recruitment', recruitmentRouter],
  ['/performance', performanceRouter],
  ['/ai', aiRouter],
  ['/reports', reportsRouter],
  ['/notifications', notificationsRouter],
  ['/profile', profileRouter],
  ['/settings', settingsRouter],
  ['/files', filesRouter],
  ['/global', globalRouter],
  ['/security', securityRouter],
];

for (const [path, router] of API_MOUNTS) {
  apiRouter.use(path, router);
}
