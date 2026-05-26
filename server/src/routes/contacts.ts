/**
 * Contacts API
 * Operational contacts for vendors, shippers, builders, etc.
 */
import { Router } from 'express';
import { withTenantScope } from '../db/index.js';
import { contacts, eq, and, ilike, or } from '@skavan/rentalzen-drizzle';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import { requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import {
  ValidationError,
  parseOptionalString,
} from './shared/validation.js';

const router = Router();

const CONTACT_TYPE_VALUES = ['vendor', 'shipper', 'builder', 'service', 'agent', 'sales'] as const;
type ContactType = (typeof CONTACT_TYPE_VALUES)[number];
const CONTACT_TYPE_SET = new Set<ContactType>(CONTACT_TYPE_VALUES);

const coerceContactType = (value: unknown): ContactType | null => {
  if (value === undefined || value === null || value === '') return null;
  const ct = String(value) as ContactType;
  if (!CONTACT_TYPE_SET.has(ct)) {
    throw new ValidationError(`contactType must be one of ${CONTACT_TYPE_VALUES.join(', ')}`);
  }
  return ct;
};

/**
 * GET /api/contacts
 * List contacts with optional filters
 * Query params: contact_type, is_active, search, include_inactive
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { contact_type, is_active, search, include_inactive } = req.query;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const whereConditions: any[] = [eq(contacts.customerId, scope.customerId)];

      if (contact_type) {
        const ct = coerceContactType(contact_type);
        if (ct) whereConditions.push(eq(contacts.contactType, ct));
      }

      if (is_active !== undefined) {
        whereConditions.push(eq(contacts.isActive, is_active === 'true'));
      } else if (include_inactive !== 'true') {
        whereConditions.push(eq(contacts.isActive, true));
      }

      if (search && typeof search === 'string') {
        whereConditions.push(
          or(
            ilike(contacts.firstName, `%${search}%`),
            ilike(contacts.lastName, `%${search}%`),
            ilike(contacts.emailAddress, `%${search}%`),
            ilike(contacts.phoneNumber, `%${search}%`)
          )
        );
      }

      return scopedDb
        .select()
        .from(contacts)
        .where(and(...whereConditions))
        .orderBy(contacts.lastName, contacts.firstName);
    });

    res.json({ data: results, count: results.length });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Contacts GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/contacts/:id
 * Get single contact by ID
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(contacts)
        .where(and(eq(contacts.customerId, scope.customerId), eq(contacts.id, Number(id))))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ data: results[0] });
  } catch (error) {
    console.error('Contact GET by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/contacts
 * Create new contact (requires auth)
 */
router.post('/', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const {
      firstName, lastName, phoneNumber, emailAddress,
      streetAddress, city, state, zipCode, country,
      notes, contactType, isActive,
    } = req.body || {};

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(contacts)
        .values({
          customerId: scope.customerId,
          firstName: parseOptionalString(firstName) ?? null,
          lastName: parseOptionalString(lastName) ?? null,
          phoneNumber: parseOptionalString(phoneNumber) ?? null,
          emailAddress: parseOptionalString(emailAddress) ?? null,
          streetAddress: parseOptionalString(streetAddress) ?? null,
          city: parseOptionalString(city) ?? null,
          state: parseOptionalString(state) ?? null,
          zipCode: parseOptionalString(zipCode) ?? null,
          country: parseOptionalString(country) ?? null,
          notes: parseOptionalString(notes) ?? null,
          contactType: coerceContactType(contactType),
          isActive: isActive !== undefined ? !!isActive : true,
        })
        .returning();
    });

    const created = results[0];
    eventBus.broadcast({
      event: 'data_change:contacts',
      data: { type: 'create', resource: 'contacts', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Contact POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/contacts/:id
 * Update contact (requires auth)
 */
router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;
    const {
      firstName, lastName, phoneNumber, emailAddress,
      streetAddress, city, state, zipCode, country,
      notes, contactType, isActive,
    } = req.body || {};

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const updates: Record<string, any> = { updatedAt: new Date() };

      if (firstName !== undefined) updates.firstName = parseOptionalString(firstName) ?? null;
      if (lastName !== undefined) updates.lastName = parseOptionalString(lastName) ?? null;
      if (phoneNumber !== undefined) updates.phoneNumber = parseOptionalString(phoneNumber) ?? null;
      if (emailAddress !== undefined) updates.emailAddress = parseOptionalString(emailAddress) ?? null;
      if (streetAddress !== undefined) updates.streetAddress = parseOptionalString(streetAddress) ?? null;
      if (city !== undefined) updates.city = parseOptionalString(city) ?? null;
      if (state !== undefined) updates.state = parseOptionalString(state) ?? null;
      if (zipCode !== undefined) updates.zipCode = parseOptionalString(zipCode) ?? null;
      if (country !== undefined) updates.country = parseOptionalString(country) ?? null;
      if (notes !== undefined) updates.notes = parseOptionalString(notes) ?? null;
      if (contactType !== undefined) updates.contactType = coerceContactType(contactType);
      if (isActive !== undefined) updates.isActive = !!isActive;

      return scopedDb
        .update(contacts)
        .set(updates)
        .where(and(eq(contacts.customerId, scope.customerId), eq(contacts.id, Number(id))))
        .returning();
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const updated = results[0];
    eventBus.broadcast({
      event: 'data_change:contacts',
      data: { type: 'update', resource: 'contacts', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Contact PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/contacts/:id
 * Delete contact (requires auth)
 */
router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(contacts)
        .where(and(eq(contacts.customerId, scope.customerId), eq(contacts.id, Number(id))))
        .returning();
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const deleted = results[0];
    eventBus.broadcast({
      event: 'data_change:contacts',
      data: { type: 'delete', resource: 'contacts', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ message: 'Contact deleted successfully', data: deleted });
  } catch (error) {
    console.error('Contact DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
