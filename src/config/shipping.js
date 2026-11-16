/**
 * @fileoverview Shipping configuration for GHTK (Giao Hang Tiet Kiem) integration.
 * Contains default sender info, status mappings, provider config, and weight limits.
 * @module config/shipping
 */

/**
 * Default pick (sender) address information.
 * Used as fallback when no specific pick address is provided.
 * @type {Object}
 */
export const DEFAULT_PICK_INFO = {
  pick_name: process.env.GHTK_PICK_NAME || 'Cửa hàng',
  pick_money: 0,
  pick_address_id: process.env.GHTK_PICK_ADDRESS_ID || '',
  pick_address: process.env.GHTK_PICK_ADDRESS || '',
  pick_province: process.env.GHTK_PICK_PROVINCE || 'Hà Nội',
  pick_district: process.env.GHTK_PICK_DISTRICT || 'Quận Cầu Giấy',
  pick_ward: process.env.GHTK_PICK_WARD || '',
  pick_street: process.env.GHTK_PICK_STREET || '',
  pick_tel: process.env.GHTK_PICK_TEL || '',
  pick_email: process.env.GHTK_PICK_EMAIL || '',
};

/**
 * Maps GHTK shipment status codes to internal order statuses.
 *
 * GHTK status codes:
 *  -1 : Hủy đơn hàng
 *   1 : Chưa tiếp nhận
 *   2 : Đã tiếp nhận
 *   3 : Đã lấy hàng / Đã nhập kho
 *   4 : Đã điều phối giao hàng / Đang giao hàng
 *   5 : Đã giao hàng / Chưa đối soát
 *   6 : Đã đối soát
 *   7 : Không lấy được hàng
 *   8 : Hoãn lấy hàng
 *   9 : Không giao được hàng
 *  10 : Delay giao hàng
 *  11 : Đã đối soát công nợ trả hàng
 *  12 : Đã điều phối lấy hàng / Đang lấy hàng
 *  13 : Đơn hàng bồi thường
 *  20 : Đang trả hàng (COD về 0)
 *  21 : Đã trả hàng (COD về 0)
 *
 * @type {Record<number, string>}
 */
export const GHTK_STATUS_MAP = {
  [-1]: 'cancelled',
  1: 'pending',
  2: 'accepted',
  3: 'picked_up',
  4: 'delivering',
  5: 'delivered',
  6: 'reconciled',
  7: 'pick_failed',
  8: 'pick_delayed',
  9: 'delivery_failed',
  10: 'delivery_delayed',
  11: 'return_reconciled',
  12: 'picking_up',
  13: 'compensated',
  20: 'returning',
  21: 'returned',
};

/**
 * Shipping provider configurations.
 * @type {Record<string, Object>}
 */
export const SHIPPING_PROVIDERS = {
  ghtk: {
    name: 'Giao Hàng Tiết Kiệm',
    code: 'GHTK',
    enabled: true,
    apiUrl: process.env.GHTK_API_URL || 'https://services.giaohangtietkiem.vn',
    /** Sandbox/dev environment URL */
    sandboxUrl: 'https://services.ghtklab.com',
    /** Transport methods: road or fly */
    transportMethods: ['road', 'fly'],
    /** Default transport method */
    defaultTransport: 'road',
    /** Whether to use freeship (shop pays shipping) */
    defaultFreeship: false,
  },
};

/**
 * Weight and dimension limits reference for GHTK shipments.
 * @type {Object}
 */
export const WEIGHT_LIMITS = {
  /** Maximum weight per package in grams */
  maxWeightGrams: 50000,
  /** Minimum weight per package in grams */
  minWeightGrams: 1,
  /** Default weight in grams if not specified */
  defaultWeightGrams: 500,
  /** Maximum value (VND) for COD */
  maxCodValue: 20000000,
  /** Standard weight tiers (grams) for fee calculation reference */
  tiers: [
    { maxGrams: 250, label: 'Dưới 250g' },
    { maxGrams: 500, label: '250g - 500g' },
    { maxGrams: 1000, label: '500g - 1kg' },
    { maxGrams: 2000, label: '1kg - 2kg' },
    { maxGrams: 5000, label: '2kg - 5kg' },
    { maxGrams: 10000, label: '5kg - 10kg' },
    { maxGrams: 20000, label: '10kg - 20kg' },
    { maxGrams: 50000, label: '20kg - 50kg' },
  ],
};

export default {
  DEFAULT_PICK_INFO,
  GHTK_STATUS_MAP,
  SHIPPING_PROVIDERS,
  WEIGHT_LIMITS,
};
