/**
 * Plain TypeScript representation of public.crm_lead_sources.
 * Generated 2025-10-31T22:04:04.068Z.
 */

export interface CrmLeadSource {
  id: number;
  tenantId: number; // column: tenant_id
  name: string;
  description: string | null;
  sourceType: string | null; // column: source_type
  defaultCommissionRate: number | null; // column: default_commission_rate
  defaultCommissionType: string | null; // column: default_commission_type
  defaultCommissionAmount: number | null; // column: default_commission_amount
  isActive: boolean | null; // column: is_active
  sortOrder: number | null; // column: sort_order
  createdAt: string; // column: created_at
  updatedAt: string; // column: updated_at
}
