import { Router } from 'express';
import { attendanceRouter } from '../modules/attendance/attendance.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { employeesRouter } from '../modules/employees/employees.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { leaveRouter } from '../modules/leave/leave.routes.js';
import { organizationRouter } from '../modules/organization/organization.routes.js';
import { payrollRouter } from '../modules/payroll/payroll.routes.js';
import { performanceRouter } from '../modules/performance/performance.routes.js';
import { recruitmentRouter } from '../modules/recruitment/recruitment.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/organization', organizationRouter);
apiRouter.use('/employees', employeesRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/leave', leaveRouter);
apiRouter.use('/payroll', payrollRouter);
apiRouter.use('/recruitment', recruitmentRouter);
apiRouter.use('/performance', performanceRouter);
