import test from 'node:test';
import assert from 'node:assert/strict';
import TikTokService from '../src/services/tiktokService.js';

const accounts = [
  {
    shopId: 'shop_tt_01',
    name: 'TikTok Shop 01',
    appKey: 'app-key-1',
    appSecret: 'app-secret-1',
    accessToken: 'token-1',
  },
  {
    shopId: 'shop_tt_02',
    name: 'TikTok Shop 02',
    appKey: 'app-key-2',
    appSecret: 'app-secret-2',
    accessToken: 'token-2',
  },
];

test('resolves multiple TikTok Shop accounts by shop ID', () => {
  const service = new TikTokService({ accounts });

  assert.equal(service.resolveAccount('shop_tt_01')?.name, 'TikTok Shop 01');
  assert.equal(service.resolveAccount('shop_tt_02')?.name, 'TikTok Shop 02');
  assert.equal(service.resolveAccount('shop_tt_unknown'), null);
});

test('lists TikTok accounts without exposing access tokens', () => {
  const service = new TikTokService({ accounts });
  const listed = service.getAccounts();

  assert.deepEqual(listed, [
    { shopId: 'shop_tt_01', name: 'TikTok Shop 01', connected: true },
    { shopId: 'shop_tt_02', name: 'TikTok Shop 02', connected: true },
  ]);
  assert.equal(JSON.stringify(listed).includes('token-'), false);
});

test('rejects webhook payload from an unconfigured TikTok Shop', async () => {
  const service = new TikTokService({ accounts });
  const results = await service.processWebhook({
    type: 'ORDER_STATUS_CHANGE',
    shop_id: 'shop_tt_unknown',
    data: {
      order_id: 'TT-UNKNOWN',
      order_status: 'UNPAID',
    },
  });

  assert.deepEqual(results, []);
});

test('uses account-specific app secret to generate signature', () => {
  const service = new TikTokService({ accounts });
  const account = service.resolveAccount('shop_tt_02');
  const signature = service._generateSignatureWithSecret(
    account.appSecret,
    '/api/orders/detail/query',
    { app_key: 'app-key-2', timestamp: '1700000000' },
    '{"order_id":"TT-100"}'
  );

  assert.match(signature, /^[a-f0-9]{64}$/);
});

test('filters TikTok accounts according to user F0/F1/F2 allowedShopIds', () => {
  const service = new TikTokService({ accounts });

  const adminList = service.getAccountsForUser({ role: 'F0', allowedShopIds: ['shop_tt_01'] });
  assert.equal(adminList.length, 2);

  const memberList = service.getAccountsForUser({ role: 'F2', allowedShopIds: ['shop_tt_02'] });
  assert.equal(memberList.length, 1);
  assert.equal(memberList[0].shopId, 'shop_tt_02');
});

test('verifies webhook HMAC signature per TikTok Shop account', () => {
  const service = new TikTokService({ accounts });
  const rawBody = '{"type":"ORDER_STATUS_CHANGE","shop_id":"shop_tt_01"}';
  const params = { app_key: 'app-key-1', timestamp: '1700000000' };
  const validSig = service._generateSignatureWithSecret(
    'app-secret-1',
    '/api/webhooks/tiktok',
    params,
    rawBody
  );

  assert.equal(
    service.verifyWebhookSignature({
      path: '/api/webhooks/tiktok',
      params,
      rawBody,
      signature: validSig,
      shopId: 'shop_tt_01',
    }),
    true
  );

  assert.equal(
    service.verifyWebhookSignature({
      path: '/api/webhooks/tiktok',
      params,
      rawBody,
      signature: 'invalid_signature',
      shopId: 'shop_tt_01',
    }),
    false
  );
});
