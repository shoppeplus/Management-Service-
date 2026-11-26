/**
 * Product Routes (Sản Phẩm & Danh Mục Phân Cấp)
 * ───────────────────────────────────────────────
 * Implements endpoints from Addendum A (Section A6) & Ver 1.0 Category Tree:
 * - GET /api/products
 * - POST /api/products (requires product.manage)
 * - GET /api/products/:id
 * - PATCH /api/products/:id (requires product.manage)
 * - GET /api/products/categories/all (hierarchical category tree + attached products, scoped by user)
 * - POST /api/products/categories/all (requires product.manage)
 */

import { Router } from 'express';
import defaultProducts, { productCategories } from '../data/products.js';
import { requirePermission } from '../middleware/rbac.js';
import { getUserDataScope } from '../utils/rbac.js';

const router = Router();

// In-memory products & categories store initialized with sample catalog
let inMemoryProducts = [...defaultProducts];
let inMemoryCategories = productCategories.map((cat) => ({
  ...cat,
  children: Array.isArray(cat.children) ? cat.children.map((c) => ({ ...c })) : [],
}));

/**
 * Enrich categories with their attached products and filter by user scope (F0/F1/F2)
 */
export function buildScopedCategoryTree(categories, products, user = null) {
  const scope = getUserDataScope(user);
  const allowedSet = Array.isArray(scope.allowedCategories) && scope.allowedCategories.length > 0
    ? new Set(scope.allowedCategories.map((c) => String(c).toLowerCase()))
    : null;

  const isCategoryAllowed = (catName) => {
    if (!allowedSet) return true;
    return allowedSet.has(String(catName || '').toLowerCase());
  };

  return categories
    .filter((cat) => {
      if (isCategoryAllowed(cat.name)) return true;
      return (cat.children || []).some((child) => isCategoryAllowed(child.name));
    })
    .map((cat) => {
      const catProducts = products.filter(
        (p) => String(p.category || '').toLowerCase() === String(cat.name).toLowerCase()
      );

      const children = (cat.children || [])
        .filter((child) => isCategoryAllowed(cat.name) || isCategoryAllowed(child.name))
        .map((child) => {
          const childProducts = catProducts.filter(
            (p) => String(p.subCategory || '').toLowerCase() === String(child.name).toLowerCase()
          );
          return {
            ...child,
            parentName: cat.name,
            productCount: childProducts.length,
            products: childProducts.map((p) => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              price: p.price,
              category: p.category,
              subCategory: p.subCategory,
              stock: p.stock ?? null,
            })),
          };
        });

      return {
        ...cat,
        productCount: catProducts.length,
        products: catProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          price: p.price,
          category: p.category,
          subCategory: p.subCategory || null,
          stock: p.stock ?? null,
        })),
        children,
      };
    });
}

// ── GET / ─ List products ───────────────────────────────────
router.get('/', requirePermission('product.read'), (req, res) => {
  const { category, subCategory, search } = req.query;
  const scope = getUserDataScope(req.user);
  let list = [...inMemoryProducts];

  if (Array.isArray(scope.allowedCategories) && scope.allowedCategories.length > 0) {
    const allowed = new Set(scope.allowedCategories.map((c) => String(c).toLowerCase()));
    list = list.filter(
      (p) =>
        allowed.has(String(p.category || '').toLowerCase()) ||
        allowed.has(String(p.subCategory || '').toLowerCase())
    );
  }

  if (category) {
    const target = category.toLowerCase();
    list = list.filter(
      (p) =>
        p.category?.toLowerCase() === target ||
        p.subCategory?.toLowerCase() === target
    );
  }
  if (subCategory) {
    list = list.filter((p) => p.subCategory?.toLowerCase() === subCategory.toLowerCase());
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(
      (p) =>
        p.name?.toLowerCase().includes(s) ||
        p.id?.toLowerCase().includes(s) ||
        p.sku?.toLowerCase().includes(s)
    );
  }

  return res.json({ success: true, data: list });
});

// ── GET /categories/all ─ Hierarchical category tree + attached products ──
router.get('/categories/all', requirePermission('product.read'), (req, res) => {
  const tree = buildScopedCategoryTree(inMemoryCategories, inMemoryProducts, req.user);
  return res.json({ success: true, data: tree });
});

// ── POST /categories/all (Admin/Manager) ────────────────────
router.post('/categories/all', requirePermission('product.manage'), (req, res) => {
  const { name, code, parentName } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: 'Tên danh mục là bắt buộc.' });
  }
  const newCat = {
    id: `cat_${Date.now()}`,
    name,
    code: code || name.toUpperCase().replace(/\s+/g, '_'),
    parentName: parentName || null,
    children: [],
  };

  if (parentName) {
    const parent = inMemoryCategories.find(
      (c) => c.name.toLowerCase() === String(parentName).toLowerCase()
    );
    if (parent) {
      parent.children = parent.children || [];
      parent.children.push(newCat);
      return res.status(201).json({ success: true, data: newCat });
    }
  }

  inMemoryCategories.push(newCat);
  return res.status(201).json({ success: true, data: newCat });
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
  const { name, price, category, subCategory, weight, image, sku, stock } = req.body;
  if (!name || !price) {
    return res.status(400).json({ success: false, message: 'Tên và giá sản phẩm là bắt buộc.' });
  }

  const newProduct = {
    id: `PROD-${String(inMemoryProducts.length + 1).padStart(3, '0')}`,
    sku: sku || `SKU-${Date.now().toString().slice(-6)}`,
    name,
    price: Number(price),
    category: category || 'Khác',
    subCategory: subCategory || null,
    weight: Number(weight) || 100,
    stock: stock !== undefined ? Number(stock) : 100,
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

export default router;
