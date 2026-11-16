/**
 * @fileoverview GHTK (Giao Hang Tiet Kiem) API integration service.
 * Provides methods for calculating shipping fees, creating/cancelling orders,
 * tracking shipments, and managing pick addresses.
 * @module services/ghtkService
 */

import axios from 'axios';
import { GHTK_STATUS_MAP } from '../config/shipping.js';

/**
 * Service class for interacting with the GHTK logistics API.
 */
class GHTKService {
  /**
   * Creates a new GHTKService instance.
   * Reads GHTK_API_URL and GHTK_API_TOKEN from environment variables
   * and creates a pre-configured axios instance.
   *
   * @throws {Error} If GHTK_API_TOKEN is not set.
   */
  constructor() {
    this.apiUrl = process.env.GHTK_API_URL || 'https://services.giaohangtietkiem.vn';
    this.apiToken = process.env.GHTK_API_TOKEN;

    if (!this.apiToken) {
      console.warn('[GHTKService] GHTK_API_TOKEN is not set. API calls will fail.');
    }

    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        Token: this.apiToken,
      },
      timeout: 30000,
    });

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[GHTKService] ${response.config.method.toUpperCase()} ${response.config.url} -> ${response.status}`);
        return response;
      },
      (error) => {
        const status = error.response?.status || 'NETWORK_ERROR';
        const url = error.config?.url || 'unknown';
        console.error(`[GHTKService] Request failed: ${url} -> ${status}`, error.message);
        return Promise.reject(error);
      },
    );
  }

  /**
   * Builds a standardized success response.
   *
   * @param {*} data - The response payload.
   * @returns {{ success: true, data: *, error: null }}
   * @private
   */
  _successResponse(data) {
    return { success: true, data, error: null };
  }

  /**
   * Builds a standardized error response.
   *
   * @param {Error|string} error - The error or message.
   * @returns {{ success: false, data: null, error: string }}
   * @private
   */
  _errorResponse(error) {
    const message =
      error?.response?.data?.message ||
      error?.message ||
      String(error);
    return { success: false, data: null, error: message };
  }

  /**
   * Calculate the shipping fee for a shipment.
   *
   * @param {Object} params - Shipping fee calculation parameters.
   * @param {string} params.pick_province - Sender province.
   * @param {string} params.pick_district - Sender district.
   * @param {string} params.province - Receiver province.
   * @param {string} params.district - Receiver district.
   * @param {string} params.address - Receiver full address.
   * @param {number} params.weight - Package weight in grams.
   * @param {number} [params.value] - Declared goods value in VND.
   * @param {string} [params.transport] - Transport method: 'road' or 'fly'.
   * @param {string} [params.deliver_option] - Delivery option: 'xteam' or 'none'.
   * @returns {Promise<{ success: boolean, data: Object|null, error: string|null }>}
   *   On success, data contains { fee, insurance_fee, delivery_time, ... }.
   */
  async calculateShippingFee(params) {
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
        deliver_option,
      } = params;

      const response = await this.client.get('/services/shipment/fee', {
        params: {
          pick_province,
          pick_district,
          province,
          district,
          address,
          weight,
          value,
          transport,
          deliver_option,
        },
      });

      if (response.data?.success) {
        return this._successResponse(response.data.fee);
      }

      return this._errorResponse(response.data?.message || 'Failed to calculate shipping fee');
    } catch (error) {
      console.error('[GHTKService] calculateShippingFee error:', error.message);
      return this._errorResponse(error);
    }
  }

  /**
   * Create a new shipping order on GHTK.
   *
   * @param {Object} orderData - The full order payload.
   * @param {Object} orderData.order - Order & recipient details.
   * @param {string} orderData.order.id - Internal order reference ID.
   * @param {string} orderData.order.pick_name - Sender name.
   * @param {string} orderData.order.pick_money - COD amount (VND).
   * @param {string} orderData.order.pick_address_id - Pick address ID.
   * @param {string} orderData.order.pick_address - Sender address.
   * @param {string} orderData.order.pick_province - Sender province.
   * @param {string} orderData.order.pick_district - Sender district.
   * @param {string} orderData.order.pick_ward - Sender ward.
   * @param {string} orderData.order.pick_tel - Sender phone.
   * @param {string} orderData.order.name - Receiver name.
   * @param {string} orderData.order.address - Receiver address.
   * @param {string} orderData.order.province - Receiver province.
   * @param {string} orderData.order.district - Receiver district.
   * @param {string} orderData.order.ward - Receiver ward.
   * @param {string} orderData.order.tel - Receiver phone.
   * @param {string} [orderData.order.email] - Receiver email.
   * @param {string} [orderData.order.note] - Delivery notes.
   * @param {number} [orderData.order.value] - Declared goods value (VND).
   * @param {string} [orderData.order.transport] - Transport method: 'road' or 'fly'.
   * @param {Array<Object>} orderData.products - List of products in the shipment.
   * @param {string} orderData.products[].name - Product name.
   * @param {number} orderData.products[].weight - Product weight (grams).
   * @param {number} [orderData.products[].quantity] - Quantity (default 1).
   * @param {number} [orderData.products[].product_code] - Product SKU.
   * @returns {Promise<{ success: boolean, data: { trackingId: string, sortingCode: string, estimatedDelivery: string }|null, error: string|null }>}
   */
  async createOrder(orderData) {
    try {
      const { order, products } = orderData;

      const response = await this.client.post('/services/shipment/order', {
        order,
        products,
      });

      if (response.data?.success) {
        const result = response.data.order || response.data;
        return this._successResponse({
          trackingId: result.label || result.tracking_id || null,
          sortingCode: result.sorting_code || null,
          estimatedDelivery: result.estimated_deliver_time || null,
          fee: result.fee || null,
          insuranceFee: result.insurance_fee || null,
          statusId: result.status_id ?? null,
          rawResponse: result,
        });
      }

      return this._errorResponse(response.data?.message || 'Failed to create order');
    } catch (error) {
      console.error('[GHTKService] createOrder error:', error.message);
      return this._errorResponse(error);
    }
  }

  /**
   * Get the current status of a shipment by tracking ID.
   *
   * @param {string} trackingId - The GHTK tracking/label ID.
   * @returns {Promise<{ success: boolean, data: { status: string, statusCode: number, statusText: string, pickDate: string, deliverDate: string, weight: number, fee: number }|null, error: string|null }>}
   */
  async getOrderStatus(trackingId) {
    try {
      if (!trackingId) {
        return this._errorResponse('Tracking ID is required');
      }

      const response = await this.client.get(`/services/shipment/v2/${trackingId}`);

      if (response.data?.success) {
        const info = response.data.order || response.data;
        const statusCode = info.status ?? info.status_id;
        return this._successResponse({
          trackingId,
          status: GHTK_STATUS_MAP[statusCode] || 'unknown',
          statusCode,
          statusText: info.status_text || null,
          pickDate: info.pick_date || null,
          deliverDate: info.deliver_date || null,
          customerFullname: info.customer_fullname || null,
          customerTel: info.customer_tel || null,
          weight: info.weight || null,
          fee: info.fee || null,
          shipMoney: info.ship_money_fee || null,
          returnInfo: info.return_part_package || null,
          rawResponse: info,
        });
      }

      return this._errorResponse(response.data?.message || 'Failed to get order status');
    } catch (error) {
      console.error('[GHTKService] getOrderStatus error:', error.message);
      return this._errorResponse(error);
    }
  }

  /**
   * Cancel a shipment order by tracking ID.
   *
   * @param {string} trackingId - The GHTK tracking/label ID.
   * @returns {Promise<{ success: boolean, data: { trackingId: string, cancelled: boolean }|null, error: string|null }>}
   */
  async cancelOrder(trackingId) {
    try {
      if (!trackingId) {
        return this._errorResponse('Tracking ID is required');
      }

      const response = await this.client.post(`/services/shipment/cancel/${trackingId}`);

      if (response.data?.success) {
        return this._successResponse({
          trackingId,
          cancelled: true,
          message: response.data.message || 'Order cancelled successfully',
        });
      }

      return this._errorResponse(response.data?.message || 'Failed to cancel order');
    } catch (error) {
      console.error('[GHTKService] cancelOrder error:', error.message);
      return this._errorResponse(error);
    }
  }

  /**
   * Retrieve the list of registered pick (sender) addresses.
   *
   * @returns {Promise<{ success: boolean, data: Array<Object>|null, error: string|null }>}
   *   On success, data is an array of pick address objects.
   */
  async getPickAddresses() {
    try {
      const response = await this.client.get('/services/shipment/list_pick_add');

      if (response.data?.success) {
        return this._successResponse(response.data.data || []);
      }

      return this._errorResponse(response.data?.message || 'Failed to get pick addresses');
    } catch (error) {
      console.error('[GHTKService] getPickAddresses error:', error.message);
      return this._errorResponse(error);
    }
  }
}

export default GHTKService;
