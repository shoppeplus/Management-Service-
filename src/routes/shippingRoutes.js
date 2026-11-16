/**
 * @fileoverview Express routes for GHTK shipping integration.
 * Provides endpoints for fee calculation, order creation, tracking,
 * cancellation, and pick-address management.
 * @module routes/shippingRoutes
 */

import { Router } from 'express';
import GHTKService from '../services/ghtkService.js';
import { DEFAULT_PICK_INFO } from '../config/shipping.js';
import authMiddleware from '../middleware/auth.js';

const router = Router();
const ghtkService = new GHTKService();

// Apply auth middleware to all shipping routes
router.use(authMiddleware);

/**
 * POST /calculate-fee
 * Calculate the shipping fee for a potential shipment.
 *
 * @body {string} pick_province - Sender province (falls back to DEFAULT_PICK_INFO).
 * @body {string} pick_district - Sender district (falls back to DEFAULT_PICK_INFO).
 * @body {string} province      - Receiver province.
 * @body {string} district      - Receiver district.
 * @body {string} address       - Receiver full address.
 * @body {number} weight        - Package weight in grams.
 * @body {number} [value]       - Declared goods value (VND).
 * @body {string} [transport]   - 'road' or 'fly'.
 */
router.post('/calculate-fee', async (req, res) => {
  try {
    const {
      pick_province,
      pick_district,
      province,
      district,
      address,
      weight,
      value,
      transport,
    } = req.body;

    // Validate required fields
    if (!province || !district || !address || !weight) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: province, district, address, weight',
      });
    }

    const result = await ghtkService.calculateShippingFee({
      pick_province: pick_province || DEFAULT_PICK_INFO.pick_province,
      pick_district: pick_district || DEFAULT_PICK_INFO.pick_district,
      province,
      district,
      address,
      weight,
      value,
      transport,
    });

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('[ShippingRoutes] POST /calculate-fee error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /create-order
 * Create a shipping order via GHTK and persist the tracking ID on the
 * local Order record.
 *
 * @body {string} orderId              - Internal order ID to attach tracking to.
 * @body {Object} receiver             - Receiver info (name, address, province, district, ward, tel, email).
 * @body {Array}  products             - Product list [{name, weight, quantity}].
 * @body {number} [pick_money]         - COD amount.
 * @body {string} [note]               - Delivery notes.
 * @body {number} [value]              - Declared goods value.
 * @body {string} [transport]          - 'road' or 'fly'.
 * @body {Object} [pickInfo]           - Override default sender info.
 */
router.post('/create-order', async (req, res) => {
  try {
    const {
      orderId,
      receiver,
      products,
      pick_money = 0,
      note,
      value,
      transport,
      pickInfo,
    } = req.body;

    // Validate required fields
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId is required' });
    }
    if (!receiver || !receiver.name || !receiver.address || !receiver.province || !receiver.district || !receiver.tel) {
      return res.status(400).json({
        success: false,
        error: 'Receiver info is incomplete. Required: name, address, province, district, tel',
      });
    }
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one product is required' });
    }

    // Merge pick info with defaults
    const pick = { ...DEFAULT_PICK_INFO, ...pickInfo };

    const orderPayload = {
      order: {
        id: orderId,
        pick_name: pick.pick_name,
        pick_address_id: pick.pick_address_id,
        pick_address: pick.pick_address,
        pick_province: pick.pick_province,
        pick_district: pick.pick_district,
        pick_ward: pick.pick_ward,
        pick_street: pick.pick_street,
        pick_tel: pick.pick_tel,
        pick_email: pick.pick_email,
        pick_money,
        name: receiver.name,
        address: receiver.address,
        province: receiver.province,
        district: receiver.district,
        ward: receiver.ward || '',
        street: receiver.street || '',
        tel: receiver.tel,
        email: receiver.email || '',
        note: note || '',
        value,
        transport: transport || 'road',
      },
      products: products.map((p) => ({
        name: p.name,
        weight: p.weight,
        quantity: p.quantity || 1,
        product_code: p.product_code || undefined,
      })),
    };

    const result = await ghtkService.createOrder(orderPayload);

    if (result.success && result.data?.trackingId) {
      // Persist tracking ID to the local Orders collection/table.
      // Assumes an Order model is available via req.app or direct import.
      try {
        const Order = (await import('../models/Order.js')).default;
        await Order.findByIdAndUpdate(orderId, {
          shippingTrackingId: result.data.trackingId,
          shippingProvider: 'GHTK',
          shippingStatus: 'pending',
          shippingFee: result.data.fee || 0,
        });
        console.log(`[ShippingRoutes] Tracking ID ${result.data.trackingId} saved for order ${orderId}`);
      } catch (dbError) {
        console.error('[ShippingRoutes] Failed to save tracking ID to order:', dbError.message);
        // Still return success – the GHTK order was created
        result.data.warning = 'Shipping order created but failed to update local order record';
      }
    }

    const statusCode = result.success ? 201 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('[ShippingRoutes] POST /create-order error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /status/:trackingId
 * Retrieve the current shipping status of an order.
 *
 * @param {string} trackingId - GHTK tracking/label ID.
 */
router.get('/status/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;

    if (!trackingId) {
      return res.status(400).json({ success: false, error: 'trackingId is required' });
    }

    const result = await ghtkService.getOrderStatus(trackingId);

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('[ShippingRoutes] GET /status/:trackingId error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /cancel/:trackingId
 * Cancel a shipping order.
 *
 * @param {string} trackingId - GHTK tracking/label ID.
 */
router.post('/cancel/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;

    if (!trackingId) {
      return res.status(400).json({ success: false, error: 'trackingId is required' });
    }

    const result = await ghtkService.cancelOrder(trackingId);

    // Update local order record if cancellation succeeded
    if (result.success) {
      try {
        const Order = (await import('../models/Order.js')).default;
        await Order.findOneAndUpdate(
          { shippingTrackingId: trackingId },
          { shippingStatus: 'cancelled' },
        );
        console.log(`[ShippingRoutes] Order with tracking ${trackingId} marked as cancelled`);
      } catch (dbError) {
        console.error('[ShippingRoutes] Failed to update cancelled status locally:', dbError.message);
      }
    }

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('[ShippingRoutes] POST /cancel/:trackingId error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /pick-addresses
 * Retrieve the list of registered sender (pick) addresses from GHTK.
 */
router.get('/pick-addresses', async (req, res) => {
  try {
    const result = await ghtkService.getPickAddresses();

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('[ShippingRoutes] GET /pick-addresses error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
