/**
 * Plain TypeScript representation of public.finance_commissions.
 * Generated 2025-10-31T22:04:04.060Z.
 */

export interface FinanceCommission {
  id: number;
  tenantId: number; // column: tenant_id
  reservationId: number; // column: reservation_id
  name: string;
  type: string;
  leadSourceId: number | null; // column: lead_source_id
  agentId: number | null; // column: agent_id
  agentName: string | null; // column: agent_name
  channelName: string | null; // column: channel_name
  isRateOverridden: boolean | null; // column: is_rate_overridden
  originalRate: number | null; // column: original_rate
  calculationType: string; // column: calculation_type
  percentage: number | null;
  fixedAmount: number | null; // column: fixed_amount
  calculatedAmount: number; // column: calculated_amount
  currency: string | null;
  calculationBase: string | null; // column: calculation_base
  paymentStatus: string | null; // column: payment_status
  paidAt: string | null; // column: paid_at
  paymentMethod: string | null; // column: payment_method
  dueDate: string | null; // column: due_date
  notes: string | null;
  createdAt: string; // column: created_at
  updatedAt: string; // column: updated_at
  externalId: string | null; // column: external_id
}
