/**
 * Trends Configuration Module
 * ────────────────────────────
 * Centralized settings for AI Trend Research & Forecasting (Phase 5).
 * Configures data sources, category mappings, Gemini AI params,
 * scheduling, email alerts, and fallback demo mode settings.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root path for local cache files when in Demo Mode
export const CACHE_DIR = path.resolve(__dirname, '../data/trend-cache');

/**
 * Data Sources Configuration
 * Controls active scrapers/APIs, endpoint URLs, and rate limits
 */
export const TREND_SOURCES = {
  google_trends: {
    name: 'Google Trends Vietnam',
    enabled: true,
    geo: 'VN',
    rssUrl: 'https://trends.google.com/trending/rss?geo=VN',
    dailyRssUrl: 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=VN',
    timeout: 8000,
  },
  tiktok_shop: {
    name: 'TikTok Shop Vietnam',
    enabled: true,
    apiKey: process.env.TIKTOK_APP_KEY || '',
    apiSecret: process.env.TIKTOK_APP_SECRET || '',
    trendingHashtags: [
      '#reviewanngon',
      '#banhpancake',
      '#tiktokmademebuyit',
      '#goclamdep',
      '#xuhuongtiktok',
      '#ootdvietnam',
      '#giadungtienich',
    ],
    timeout: 8000,
  },
  shopee: {
    name: 'Shopee Vietnam',
    enabled: true,
    apiKey: process.env.SHOPEE_API_KEY || '',
    searchKeywords: [
      'bánh pancake',
      'máy làm bánh',
      'đồ ăn vặt',
      'gia dụng thông minh',
      'thời trang hot trend',
    ],
    recommendUrl: 'https://shopee.vn/api/v4/recommend/recommend?bundle=flash_sale_header_items',
    searchUrl: 'https://shopee.vn/api/v4/search/search_items',
    timeout: 8000,
  },
  lazada: {
    name: 'Lazada Vietnam',
    enabled: true,
    apiKey: process.env.LAZADA_API_KEY || '',
    searchUrl: 'https://www.lazada.vn/catalog/',
    timeout: 8000,
  },
};

/**
 * Standard Category Taxonomy
 * Normalizes disparate category names from multiple e-commerce platforms
 */
export const CATEGORIES = {
  my_pham: {
    id: 'my_pham',
    name: 'Mỹ phẩm & Làm đẹp',
    keywords: ['skincare', 'son môi', 'chống nắng', 'serum', 'tẩy trang', 'kem dưỡng', 'làm đẹp', 'nước hoa'],
  },
  thoi_trang: {
    id: 'thoi_trang',
    name: 'Thời trang & Phụ kiện',
    keywords: ['áo polo', 'quần', 'đầm', 'váy', 'túi xách', 'giày', 'sneaker', 'linen', 'thời trang', 'phụ kiện'],
  },
  dien_tu: {
    id: 'dien_tu',
    name: 'Điện tử & Thiết bị số',
    keywords: ['tai nghe', 'bluetooth', 'pin', 'sạc dự phòng', 'smartwatch', 'đồng hồ thông minh', 'loa', 'magsafe', 'quạt tích điện'],
  },
  do_gia_dung: {
    id: 'do_gia_dung',
    name: 'Đồ gia dụng & Đời sống',
    keywords: ['máy làm bánh', 'nồi chiên', 'bình giữ nhiệt', 'hộp cơm', 'bếp', 'chống dính', 'gia dụng', 'nhà cửa'],
  },
  thuc_pham: {
    id: 'thuc_pham',
    name: 'Thực phẩm & Đồ ăn vặt',
    keywords: ['bột pancake', 'bột làm bánh', 'sốt socola', 'topping', 'trà sữa', 'granola', 'ăn vặt', 'nguyên liệu', 'bánh kẹo'],
  },
  me_be: {
    id: 'me_be',
    name: 'Mẹ & Bé',
    keywords: ['tã', 'bỉm', 'sữa', 'đồ chơi trẻ em', 'bình sữa', 'mẹ và bé'],
  },
};

/**
 * Helper to normalize raw category name or keyword into standard category key
 * @param {string} raw
 * @returns {string} Standard category ID
 */
export function normalizeCategory(raw = '') {
  if (!raw) return 'do_gia_dung';
  const lower = raw.toLowerCase().trim();

  for (const [catKey, catInfo] of Object.entries(CATEGORIES)) {
    if (lower === catKey || lower === catInfo.name.toLowerCase()) {
      return catKey;
    }
    for (const kw of catInfo.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return catKey;
      }
    }
  }

  // Fallback defaults based on broad matching
  if (lower.includes('thời trang') || lower.includes('quần') || lower.includes('áo') || lower.includes('giày')) {
    return 'thoi_trang';
  }
  if (lower.includes('mỹ phẩm') || lower.includes('da') || lower.includes('son') || lower.includes('kem')) {
    return 'my_pham';
  }
  if (lower.includes('bánh') || lower.includes('ăn') || lower.includes('uống') || lower.includes('thực phẩm')) {
    return 'thuc_pham';
  }
  if (lower.includes('điện thoại') || lower.includes('tai nghe') || lower.includes('pin') || lower.includes('sạc')) {
    return 'dien_tu';
  }

  return 'do_gia_dung';
}

/**
 * Trend Scheduler Configuration
 * Sets execution time (6:00 AM VN time = UTC+7) and retries
 */
export const SCHEDULER = {
  hour: parseInt(process.env.TREND_SCHEDULE_HOUR || '6', 10),
  minute: 0,
  timezone: 'Asia/Ho_Chi_Minh',
  timezoneOffsetHours: 7,
  enabled: process.env.TREND_ENABLED !== 'false',
  retryAttempts: 3,
  retryDelayMs: 60000,
  autoRunOnStartup: true,
};

/**
 * Gemini AI Configuration
 */
export const GEMINI = {
  apiKey: process.env.GEMINI_API_KEY || '',
  model: 'gemini-2.0-flash',
  apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  temperature: 0.3,
  maxOutputTokens: 4096,
};

/**
 * Email Notification Configuration
 */
export const EMAIL = {
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  recipients: (process.env.REPORT_RECIPIENTS || 'boss@company.com,manager@company.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  fromName: 'Mini Pancake AI Intelligence',
  fromAddress: process.env.SMTP_USER || 'no-reply@minipancake.vn',
};

/**
 * Flag determining if we run in Demo / Offline Fallback mode
 */
export const DEMO_MODE =
  !process.env.GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY === 'your-gemini-api-key' ||
  process.env.DEMO_MODE === 'true';

export default {
  CACHE_DIR,
  TREND_SOURCES,
  CATEGORIES,
  SCHEDULER,
  GEMINI,
  EMAIL,
  DEMO_MODE,
  normalizeCategory,
};

