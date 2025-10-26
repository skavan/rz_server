import { Router } from 'express';
import { db } from '../db/index.js';
import { reservations } from '@postgress/shared';
import { eq } from '@postgress/shared';

const router = Router();

/**
 * GET /api/reservations
 * Get all reservations with minimal fields
 */
router.get('/', async (req, res) => {
  try {
    const reservationList = await db
      .select({
        id: reservations.id,
        bookingId: reservations.bookingId,
        firstName: reservations.firstName,
        lastName: reservations.lastName,
        fullName: reservations.fullName,
        email: reservations.email,
        status: reservations.status,
        propertyId: reservations.propertyId,
        ownerBook: reservations.ownerBook,
        leadsourceId: reservations.leadsourceId,
        totalRent: reservations.totalRent,
        taxTotal: reservations.taxTotal,
        serviceTotal: reservations.serviceTotal,
        discountTotal: reservations.discountTotal,
        grandTotal: reservations.grandTotal,
        damageDeposit: reservations.damageDeposit,
        checkin: reservations.checkin,
        checkout: reservations.checkout,
        qtyOfNights: reservations.qtyOfNights,
        numberOfAdults: reservations.numberOfAdults,
        numberOfChildren: reservations.numberOfChildren,
        createdDate: reservations.createdDate,
      })
      .from(reservations)
      .where(eq(reservations.isActive, true))
      .orderBy(reservations.checkin);

    res.json({
      success: true,
      data: reservationList,
      count: reservationList.length
    });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reservations'
    });
  }
});

/**
 * GET /api/reservations/:id
 * Get a single reservation by ID with minimal fields
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const reservation = await db
      .select({
        id: reservations.id,
        bookingId: reservations.bookingId,
        firstName: reservations.firstName,
        lastName: reservations.lastName,
        fullName: reservations.fullName,
        email: reservations.email,
        status: reservations.status,
        propertyId: reservations.propertyId,
        ownerBook: reservations.ownerBook,
        leadsourceId: reservations.leadsourceId,
        totalRent: reservations.totalRent,
        taxTotal: reservations.taxTotal,
        serviceTotal: reservations.serviceTotal,
        discountTotal: reservations.discountTotal,
        grandTotal: reservations.grandTotal,
        damageDeposit: reservations.damageDeposit,
        checkin: reservations.checkin,
        checkout: reservations.checkout,
        qtyOfNights: reservations.qtyOfNights,
        numberOfAdults: reservations.numberOfAdults,
        numberOfChildren: reservations.numberOfChildren,
        createdDate: reservations.createdDate,
      })
      .from(reservations)
      .where(eq(reservations.id, parseInt(id)))
      .limit(1);

    if (reservation.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }

    res.json({
      success: true,
      data: reservation[0]
    });
  } catch (error) {
    console.error('Error fetching reservation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reservation'
    });
  }
});

/**
 * GET /api/reservations/property/:propertyId
 * Get reservations for a specific property
 */
router.get('/property/:propertyId', async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    const reservationList = await db
      .select({
        id: reservations.id,
        bookingId: reservations.bookingId,
        firstName: reservations.firstName,
        lastName: reservations.lastName,
        fullName: reservations.fullName,
        email: reservations.email,
        status: reservations.status,
        propertyId: reservations.propertyId,
        ownerBook: reservations.ownerBook,
        leadsourceId: reservations.leadsourceId,
        totalRent: reservations.totalRent,
        taxTotal: reservations.taxTotal,
        serviceTotal: reservations.serviceTotal,
        discountTotal: reservations.discountTotal,
        grandTotal: reservations.grandTotal,
        damageDeposit: reservations.damageDeposit,
        checkin: reservations.checkin,
        checkout: reservations.checkout,
        qtyOfNights: reservations.qtyOfNights,
        numberOfAdults: reservations.numberOfAdults,
        numberOfChildren: reservations.numberOfChildren,
        createdDate: reservations.createdDate,
      })
      .from(reservations)
      .where(eq(reservations.propertyId, parseInt(propertyId)))
      .orderBy(reservations.checkin);

    res.json({
      success: true,
      data: reservationList,
      count: reservationList.length
    });
  } catch (error) {
    console.error('Error fetching property reservations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch property reservations'
    });
  }
});

/**
 * GET /api/reservations/status/:status
 * Get reservations by status (reserved, confirmed, cancelled, etc.)
 */
router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    
    const reservationList = await db
      .select({
        id: reservations.id,
        bookingId: reservations.bookingId,
        firstName: reservations.firstName,
        lastName: reservations.lastName,
        fullName: reservations.fullName,
        email: reservations.email,
        status: reservations.status,
        propertyId: reservations.propertyId,
        ownerBook: reservations.ownerBook,
        leadsourceId: reservations.leadsourceId,
        totalRent: reservations.totalRent,
        taxTotal: reservations.taxTotal,
        serviceTotal: reservations.serviceTotal,
        discountTotal: reservations.discountTotal,
        grandTotal: reservations.grandTotal,
        damageDeposit: reservations.damageDeposit,
        checkin: reservations.checkin,
        checkout: reservations.checkout,
        qtyOfNights: reservations.qtyOfNights,
        numberOfAdults: reservations.numberOfAdults,
        numberOfChildren: reservations.numberOfChildren,
        createdDate: reservations.createdDate,
      })
      .from(reservations)
      .where(eq(reservations.status, status))
      .orderBy(reservations.checkin);

    res.json({
      success: true,
      data: reservationList,
      count: reservationList.length
    });
  } catch (error) {
    console.error('Error fetching reservations by status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reservations by status'
    });
  }
});

export default router;