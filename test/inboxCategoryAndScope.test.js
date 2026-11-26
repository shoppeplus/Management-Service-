import test from 'node:test';
import assert from 'node:assert/strict';
import defaultProducts, { productCategories } from '../src/data/products.js';
import { buildScopedCategoryTree } from '../src/routes/productRoutes.js';
import { getConversations } from '../src/models/conversation.js';
import { getUserDataScope } from '../src/utils/rbac.js';

test('builds hierarchical category tree with subcategories and attached products', () => {
  const tree = buildScopedCategoryTree(productCategories, defaultProducts, { role: 'F0' });

  assert.ok(tree.length >= 5);
  const electronics = tree.find((c) => c.name === 'Điện tử');
  assert.ok(electronics, 'Should contain Điện tử root category');
  assert.ok(electronics.children.length >= 2, 'Điện tử should have child subcategories');
  assert.ok(electronics.products.length >= 2, 'Điện tử should attach matching products');
});

test('scopes category tree to allowedCategories for F1 Leader / F2 Member', () => {
  const leaderUser = {
    uid: 'EMP_LEADER_1',
    role: 'F1',
    allowedCategories: ['Mỹ phẩm'],
  };
  const scopedTree = buildScopedCategoryTree(productCategories, defaultProducts, leaderUser);

  assert.equal(scopedTree.length, 1);
  assert.equal(scopedTree[0].name, 'Mỹ phẩm');
  assert.ok(scopedTree[0].products.every((p) => p.category === 'Mỹ phẩm'));
});

test('filters conversations by category, multi-shop TikTok shopId, and user scope', async () => {
  const tiktokShop1Convs = await getConversations({
    channelType: 'tiktok',
    shopId: 'shop-id-01',
  });
  assert.ok(tiktokShop1Convs.length >= 1);
  assert.ok(tiktokShop1Convs.every((c) => c.shopId === 'shop-id-01'));

  const cosmeticsConvs = await getConversations({
    category: 'Mỹ phẩm',
  });
  assert.ok(cosmeticsConvs.length >= 2);
  assert.ok(cosmeticsConvs.every((c) => c.category === 'Mỹ phẩm'));

  const scopedConvs = await getConversations({
    allowedCategories: ['Đồ gia dụng'],
    allowedShopIds: ['shop-id-02'],
  });
  assert.ok(scopedConvs.length >= 1);
  assert.ok(scopedConvs.every((c) => c.category === 'Đồ gia dụng'));
});

test('maps F0, F1, F2 roles to Ver 1.0 access control scope contract', () => {
  const f0Scope = getUserDataScope({ role: 'F0', allowedCategories: ['Mỹ phẩm'] });
  assert.equal(f0Scope.roleTier, 'F0');
  assert.equal(f0Scope.canViewDashboard, true);
  assert.equal(f0Scope.allowedCategories, null);

  const f1Scope = getUserDataScope({
    role: 'F1',
    allowedCategories: ['Điện tử'],
    allowedShopIds: ['shop-id-02'],
  });
  assert.equal(f1Scope.roleTier, 'F1');
  assert.equal(f1Scope.canViewDashboard, true);
  assert.deepEqual(f1Scope.allowedCategories, ['Điện tử']);
  assert.deepEqual(f1Scope.allowedShopIds, ['shop-id-02']);

  const f2Scope = getUserDataScope({
    role: 'F2',
    allowedCategories: ['Mỹ phẩm'],
    allowedShopIds: ['shop-id-01'],
  });
  assert.equal(f2Scope.roleTier, 'F2');
  assert.equal(f2Scope.canViewDashboard, false);
  assert.deepEqual(f2Scope.allowedCategories, ['Mỹ phẩm']);
});
