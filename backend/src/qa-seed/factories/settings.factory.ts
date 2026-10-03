import { SystemSetting } from '../../settings/system-setting.entity';
import { SystemSettingAudit } from '../../settings/system-setting-audit.entity';
import { QA_USERS } from '../qa-seed.constants';

export function buildQaSystemSettings(): {
  settings: Partial<SystemSetting>[];
  audits: Partial<SystemSettingAudit>[];
} {
  const settings: Partial<SystemSetting>[] = [
    {
      key: 'subscriber_platform_fee_enabled',
      value: 'true',
      description: 'Master switch enabling platform fee charged to subscriber at checkout',
      updatedBy: QA_USERS.ADMIN.id,
    },
    {
      key: 'subscriber_platform_fee_amount',
      value: '5',
      description: 'Platform fee value charged in INR (e.g. 5 for ₹5.00)',
      updatedBy: QA_USERS.ADMIN.id,
    },
    {
      key: 'subscriber_platform_fee_type',
      value: 'FLAT',
      description: 'Platform fee pricing model (FLAT)',
      updatedBy: QA_USERS.ADMIN.id,
    },
    {
      key: 'subscriber_platform_fee_label',
      value: 'PrimePlate Platform Fee',
      description: 'Public line-item label shown on subscriber checkout breakdown',
      updatedBy: QA_USERS.ADMIN.id,
    },
  ];

  const audits: Partial<SystemSettingAudit>[] = [
    {
      adminId: QA_USERS.ADMIN.id,
      adminEmail: QA_USERS.ADMIN.email,
      settingKey: 'subscriber_platform_fee_enabled',
      previousValue: 'false',
      newValue: 'true',
    },
    {
      adminId: QA_USERS.ADMIN.id,
      adminEmail: QA_USERS.ADMIN.email,
      settingKey: 'subscriber_platform_fee_amount',
      previousValue: '0',
      newValue: '5',
    },
  ];

  return { settings, audits };
}
