/**
 * Webhook Routes
 * ———————————————
 * Endpoints nhận sự kiện từ các kênh bên ngoài
 * (Facebook Messenger, TikTok Shop).
 *
 * Base path: /api/webhooks
 *
 * Nguyên tắc:
 * - Trả về 200 ngay lập tức để platform không retry
 * - Xử lý bất đồng bộ (async) sau khi đã respond
 * - Bắt lỗi đầy đủ, không để crash server
 */

import { Router } from 'express';
import FacebookService from '../services/facebookService.js';
import TikTokService from '../services/tiktokService.js';

const router = Router();

// Khởi tạo services (singleton cho toàn bộ lifecycle)
const facebookService = new FacebookService();
const tiktokService = new TikTokService();

// ——————————————————————————————————————————————
//  Facebook Webhooks
// ——————————————————————————————————————————————

/**
 * GET /facebook – Xác thực webhook từ Facebook.
 * Facebook gửi request này khi bạn đăng ký / cập nhật webhook URL.
 */
router.get('/facebook', (req, res) => {
  try {
    const result = facebookService.verifyWebhook(req.query);
    return res.status(result.statusCode).send(result.body);
  } catch (error) {
    console.error('GET /webhooks/facebook error:', error);
    return res.sendStatus(500);
  }
});

/**
 * POST /facebook – Nhận sự kiện từ Facebook Messenger / Page Feed.
 *
 * Trả về 200 ngay để Facebook không retry, sau đó xử lý async.
 * Facebook yêu cầu response trong vòng 20 giây.
 */
router.post('/facebook', (req, res) => {
  try {
    const body = req.body;

    // Facebook chỉ gửi webhook cho object type = 'page'
    if (body.object !== 'page') {
      return res.sendStatus(404);
    }

    // Trả về 200 ngay lập tức
    res.status(200).send('EVENT_RECEIVED');

    // Xử lý bất đồng bộ — không block response
    (async () => {
      try {
        const results = await facebookService.processWebhook(body);
        if (results.length > 0) {
          console.log(
            `[Webhook] Facebook: đã xử lý ${results.length} sự kiện.`
          );
        }
      } catch (processingError) {
        console.error('[Webhook] Lỗi xử lý Facebook event:', processingError);
      }
    })();
  } catch (error) {
    console.error('POST /webhooks/facebook error:', error);
    // Nếu chưa gửi response thì trả 500
    if (!res.headersSent) {
      return res.sendStatus(500);
    }
  }
});

// ——————————————————————————————————————————————
//  TikTok Webhooks
// ——————————————————————————————————————————————

/**
 * POST /tiktok – Nhận sự kiện từ TikTok Shop.
 *
 * Hỗ trợ event types:
 * - ORDER_STATUS_CHANGE: thay đổi trạng thái đơn hàng
 * - PACKAGE_UPDATE: cập nhật vận chuyển
 *
 * Trả về 200 ngay lập tức, xử lý async phía sau.
 */
router.post('/tiktok', (req, res) => {
  try {
    const body = req.body;

    if (!body || !body.type) {
      console.warn('[Webhook] TikTok: payload không hợp lệ.');
      return res.status(400).json({
        success: false,
        message: 'Invalid payload: missing event type.',
      });
    }

    // Trả về 200 ngay lập tức
    res.status(200).json({ success: true, message: 'Event received.' });

    // Xử lý bất đồng bộ
    (async () => {
      try {
        const results = await tiktokService.processWebhook(body);
        if (results.length > 0) {
          console.log(
            `[Webhook] TikTok: đã xử lý ${results.length} sự kiện (${body.type}).`
          );
        }
      } catch (processingError) {
        console.error('[Webhook] Lỗi xử lý TikTok event:', processingError);
      }
    })();
  } catch (error) {
    console.error('POST /webhooks/tiktok error:', error);
    if (!res.headersSent) {
      return res.sendStatus(500);
    }
  }
});

export default router;
