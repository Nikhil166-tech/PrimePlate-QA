import { User } from '../../users/user.entity';
import { Role } from '../../common/roles.enum';
import { QA_USERS, QA_PASSWORD_HASH } from '../qa-seed.constants';

export function buildQaUsers(): Partial<User>[] {
  const users: Partial<User>[] = [];

  // 1. Admin
  users.push({
    id: QA_USERS.ADMIN.id,
    email: QA_USERS.ADMIN.email,
    passwordHash: QA_PASSWORD_HASH,
    name: QA_USERS.ADMIN.name,
    phone: QA_USERS.ADMIN.phone,
    role: Role.ADMIN,
    status: 'ACTIVE',
  });

  // 2. Providers (2)
  for (const provUser of QA_USERS.PROVIDERS) {
    users.push({
      id: provUser.id,
      email: provUser.email,
      passwordHash: QA_PASSWORD_HASH,
      name: provUser.name,
      phone: provUser.phone,
      role: Role.PROVIDER,
      status: 'ACTIVE',
    });
  }

  // 3. Students (4)
  for (const stuUser of QA_USERS.STUDENTS) {
    users.push({
      id: stuUser.id,
      email: stuUser.email,
      passwordHash: QA_PASSWORD_HASH,
      name: stuUser.name,
      phone: stuUser.phone,
      area: stuUser.area,
      foodPreference: stuUser.foodPreference,
      monthlyBudget: stuUser.monthlyBudget,
      role: Role.STUDENT,
      status: 'ACTIVE',
    });
  }

  return users;
}
