/**
 * Product Routes (Sản Phẩm & Danh Mục)
 * ──────────────────────────────────────
 * Implements endpoints from Addendum A (Section A6):
 * - GET /api/products
 * - POST /api/products (requires product.manage)
 * - GET /api/products/:id
 * - PATCH /api/products/:id (requires product.manage)
 * - GET /api/product-categories
 * - POST /api/product-categories (requires product.manage)
 */

import { Router } from 'express';
import defaultProducts from '../data/products.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

// In-memory products store initialized with sample products
let inMemoryProducts = [...defaultProducts];
let inMemoryCategories = [
  { id: 'cat_1', name: 'Mỹ phẩm', code: 'MY_PHAM' },
  { id: 'cat_2', name: 'Thời trang', code: 'THOI_TRANG' },
  { id: 'cat_3', name: 'Phụ kiện', code: 'PHU_KIEN' },
  { id: 'cat_4', name: 'Đồ gia dụng', code: 'DO_GIA_DUNG' },
];

// ── GET / ─ List products ───────────────────────────────────
router.get('/', requirePermission('product.read'), (req, res) => {
  const { category, search } = req.query;
  let list = [...inMemoryProducts];

  if (category) {
    list = list.filter((p) => p.category?.toLowerCase() === category.toLowerCase());
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((p) => p.name?.toLowerCase().includes(s) || p.id?.toLowerCase().includes(s));
  }

  return res.json({ success: true, data: list });
});

// ── GET /:id ─ Get product by ID ────────────────────────────
router.get('/:id', requirePermission('product.read'), (req, res) => {
  const product = inMemoryProducts.find((p) => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
  }
  return res.json({ success: true, data: product });
});

// ── POST / ─ Create product (Admin/Manager) ─────────────────
router.post('/', requirePermission('product.manage'), (req, res) => {
  const { name, price, category, weight, image, sku } = req.body;
  if (!name || !price) {
    return res.status(400).json({ success: false, message: 'Tên và giá sản phẩm là bắt buộc.' });
  }

  const newProduct = {
    id: `PROD-${String(inMemoryProducts.length + 1).padStart(3, '0')}`,
    sku: sku || `SKU-${Date.now().toString().slice(-6)}`,
    name,
    price: Number(price),
    category: category || 'Khác',
    weight: Number(weight) || 100,
    image: image || 'https://placehold.co/400x400?text=San+Pham',
    createdAt: new Date().toISOString(),
  };

  inMemoryProducts.unshift(newProduct);
  return res.status(201).json({ success: true, data: newProduct });
});

// ── PATCH /:id ─ Update product (Admin/Manager) ─────────────
router.patch('/:id', requirePermission('product.manage'), (req, res) => {
  const product = inMemoryProducts.find((p) => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
  }

  Object.assign(product, req.body, { updatedAt: new Date().toISOString() });
  return res.json({ success: true, data: product });
});

// ── GET /product-categories ─────────────────────────────────
router.get('/categories/all', (req, res) => {
  return res.json({ success: true, data: inMemoryCategories });
});

// ── POST /product-categories (Admin/Manager) ────────────────
router.post('/categories/all', requirePermission('product.manage'), (req, res) => {
  const { name, code } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: 'Tên danh mục là bắt buộc.' });
  }
  const newCat = {
    id: `cat_${Date.now()}`,
    name,
    code: code || name.toUpperCase().replace(/\s+/g, '_'),
  };
  inMemoryCategories.push(newCat);
  return res.status(201).json({ success: true, data: newCat });
});

export default router;
