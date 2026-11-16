const { useState, useEffect, useRef, useMemo } = React;

/**
 * OrderForm Component
 * Right panel - Sales order creation form with customer lookup, product catalog,
 * logistics fee calculation, and order submission.
 * CDN-loaded React (window.React) - No import statements.
 */
(function () {
  'use strict';

  function OrderForm({ selectedCustomer, customer, onOrderCreated, currentUser, conversation }) {
    // Determine active customer from either prop
    const activeCustomer = selectedCustomer || customer;

    // -------------------------------------------------------------------------
    // 1. Customer State
    // -------------------------------------------------------------------------
    const [isCustomerInfoOpen, setIsCustomerInfoOpen] = useState(true);
    const [searchPhone, setSearchPhone] = useState('');
    const [customerStatus, setCustomerStatus] = useState(null); // 'existing' | 'new' | null
    const [customerId, setCustomerId] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [province, setProvince] = useState('');
    const [district, setDistrict] = useState('');
    const [ward, setWard] = useState('');
    const [detailAddress, setDetailAddress] = useState('');

    // -------------------------------------------------------------------------
    // 2. Product & Cart State
    // -------------------------------------------------------------------------
    const [productSearch, setProductSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [cart, setCart] = useState([]);

    // -------------------------------------------------------------------------
    // 3. Order Summary & Fees State
    // -------------------------------------------------------------------------
    const [shippingFee, setShippingFee] = useState(null); // null means "Chưa tính"
    const [isCalculatingShip, setIsCalculatingShip] = useState(false);
    const [discount, setDiscount] = useState(0);
    const [customCod, setCustomCod] = useState(null); // null means use auto-calculated COD
    const [note, setNote] = useState('');

    // -------------------------------------------------------------------------
    // 4. UI / Feedback State
    // -------------------------------------------------------------------------
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const [toastMessage, setToastMessage] = useState(null);

    // Toast auto-clear
    useEffect(() => {
      if (toastMessage) {
        const timer = setTimeout(() => {
          setToastMessage(null);
        }, 3500);
        return () => clearTimeout(timer);
      }
    }, [toastMessage]);

    // Available provinces from MockData with fallback
    const provinceList = useMemo(() => {
      if (window.MockData && Array.isArray(window.MockData.provinces) && window.MockData.provinces.length > 0) {
        return window.MockData.provinces;
      }
      return [
        {
          name: 'TP. Hồ Chí Minh',
          districts: [
            'Quận 1',
            'Quận 3',
            'Quận 5',
            'Quận 7',
            'Quận 10',
            'Quận Bình Thạnh',
            'Thành phố Thủ Đức',
            'Quận Gò Vấp',
            'Quận Phú Nhuận',
            'Quận Tân Bình',
          ],
        },
        {
          name: 'Hà Nội',
          districts: [
            'Quận Ba Đình',
            'Quận Hoàn Kiếm',
            'Quận Đống Đa',
            'Quận Cầu Giấy',
            'Quận Hai Bà Trưng',
            'Quận Thanh Xuân',
            'Quận Nam Từ Liêm',
            'Quận Hà Đông',
          ],
        },
        {
          name: 'Đà Nẵng',
          districts: [
            'Quận Hải Châu',
            'Quận Thanh Khê',
            'Quận Sơn Trà',
            'Quận Liên Chiểu',
            'Quận Ngũ Hành Sơn',
          ],
        },
      ];
    }, []);

    // Available districts for the selected province
    const districtList = useMemo(() => {
      if (!province) return [];
      const normalizedSelected = province.trim().toLowerCase();
      const matched = provinceList.find((p) => {
        const pName = p.name.trim().toLowerCase();
        return pName === normalizedSelected || pName.includes(normalizedSelected) || normalizedSelected.includes(pName);
      });
      return matched ? matched.districts : [];
    }, [province, provinceList]);

    // Available products from MockData with fallback
    const allProducts = useMemo(() => {
      if (window.MockData && Array.isArray(window.MockData.products) && window.MockData.products.length > 0) {
        return window.MockData.products;
      }
      return [
        { id: 'PROD-001', name: 'Son môi lì cao cấp', price: 250000, category: 'My pham', weight: 50, image: 'https://placehold.co/200x200?text=Son+moi' },
        { id: 'PROD-002', name: 'Kem chống nắng SPF50+', price: 320000, category: 'My pham', weight: 80, image: 'https://placehold.co/200x200?text=Kem+chong+nang' },
        { id: 'PROD-003', name: 'Serum Vitamin C dưỡng trắng', price: 450000, category: 'My pham', weight: 60, image: 'https://placehold.co/200x200?text=Serum+Vit+C' },
        { id: 'PROD-004', name: 'Áo thun unisex basic', price: 180000, category: 'Thoi trang', weight: 200, image: 'https://placehold.co/200x200?text=Ao+thun' },
        { id: 'PROD-005', name: 'Quần jogger thể thao', price: 350000, category: 'Thoi trang', weight: 350, image: 'https://placehold.co/200x200?text=Quan+jogger' },
        { id: 'PROD-006', name: 'Túi xách nữ mini', price: 290000, category: 'Phu kien', weight: 250, image: 'https://placehold.co/200x200?text=Tui+xach' },
        { id: 'PROD-007', name: 'Kính mát thời trang UV400', price: 199000, category: 'Phu kien', weight: 40, image: 'https://placehold.co/200x200?text=Kinh+mat' },
        { id: 'PROD-008', name: 'Đồng hồ dây da nam', price: 550000, category: 'Phu kien', weight: 120, image: 'https://placehold.co/200x200?text=Dong+ho' },
        { id: 'PROD-009', name: 'Bình giữ nhiệt inox 500ml', price: 220000, category: 'Do gia dung', weight: 350, image: 'https://placehold.co/200x200?text=Binh+giu+nhiet' },
        { id: 'PROD-010', name: 'Đèn bàn LED chống cận', price: 380000, category: 'Do gia dung', weight: 800, image: 'https://placehold.co/200x200?text=Den+ban+LED' },
      ];
    }, []);

    // Filtered products based on search term & category
    const filteredProducts = useMemo(() => {
      return allProducts.filter((p) => {
        const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
        const q = productSearch.toLowerCase().trim();
        const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
        return matchesCategory && matchesSearch;
      });
    }, [allProducts, selectedCategory, productSearch]);

    // Categories list for chips
    const categories = useMemo(() => {
      const cats = new Set(allProducts.map((p) => p.category));
      return ['all', ...Array.from(cats)];
    }, [allProducts]);

    // -------------------------------------------------------------------------
    // Sync with incoming activeCustomer prop
    // -------------------------------------------------------------------------
    useEffect(() => {
      if (activeCustomer) {
        setCustomerId(activeCustomer.id || '');
        setName(activeCustomer.name || '');
        setPhone(activeCustomer.phone || '');
        setSearchPhone(activeCustomer.phone || '');

        const addr = activeCustomer.address;
        if (typeof addr === 'string') {
          setDetailAddress(addr);
        } else if (addr && typeof addr === 'object') {
          if (addr.province) setProvince(addr.province);
          if (addr.district) setDistrict(addr.district);
          if (addr.ward) setWard(addr.ward);
          if (addr.detail) setDetailAddress(addr.detail);
        }

        if (activeCustomer.province) setProvince(activeCustomer.province);
        if (activeCustomer.district) setDistrict(activeCustomer.district);
        if (activeCustomer.ward) setWard(activeCustomer.ward);
        if (activeCustomer.street && !detailAddress) setDetailAddress(activeCustomer.street);

        setCustomerStatus(activeCustomer.id || activeCustomer.totalOrders > 0 ? 'existing' : 'new');
        setErrors((prev) => ({ ...prev, name: false, phone: false }));
      }
    }, [activeCustomer]);

    // -------------------------------------------------------------------------
    // Phone Search Handler (Look up from MockData.customers)
    // -------------------------------------------------------------------------
    const handlePhoneSearch = () => {
      const cleanSearch = searchPhone.trim().replace(/[\s.-]/g, '');
      if (!cleanSearch) return;

      const customerStore = (window.MockData && window.MockData.customers) || [];
      const found = customerStore.find((c) => {
        const p = (c.phone || '').replace(/[\s.-]/g, '');
        return p === cleanSearch || p.endsWith(cleanSearch) || cleanSearch.endsWith(p);
      });

      if (found) {
        setCustomerId(found.id || 'CUST-' + Date.now());
        setName(found.name || '');
        setPhone(found.phone || cleanSearch);

        // Populate address
        if (found.address && typeof found.address === 'object') {
          setProvince(found.address.province || found.province || '');
          setDistrict(found.address.district || found.district || '');
          setWard(found.address.ward || found.ward || '');
          setDetailAddress(found.address.detail || found.street || '');
        } else {
          setProvince(found.province || '');
          setDistrict(found.district || '');
          setWard(found.ward || '');
          setDetailAddress(typeof found.address === 'string' ? found.address : found.street || '');
        }

        setCustomerStatus('existing');
        setErrors((prev) => ({ ...prev, name: false, phone: false }));
      } else {
        // Not found: mark as new customer, keep current input
        setCustomerId('CUST-' + Date.now());
        setPhone(searchPhone.trim());
        setCustomerStatus('new');
      }
    };

    // -------------------------------------------------------------------------
    // Cart Handlers
    // -------------------------------------------------------------------------
    const handleAddToCart = (product) => {
      setCart((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === product.id);
        if (existingIndex > -1) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + 1,
          };
          return updated;
        } else {
          return [
            ...prev,
            {
              id: product.id,
              name: product.name,
              price: product.price,
              weight: product.weight || 100,
              category: product.category,
              quantity: 1,
            },
          ];
        }
      });
      setErrors((prev) => ({ ...prev, cart: false }));
    };

    const handleUpdateQuantity = (productId, delta) => {
      setCart((prev) =>
        prev
          .map((item) => {
            if (item.id === productId) {
              const newQty = item.quantity + delta;
              return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
          })
          .filter((item) => item.quantity > 0)
      );
    };

    const handleRemoveFromCart = (productId) => {
      setCart((prev) => prev.filter((item) => item.id !== productId));
    };

    // -------------------------------------------------------------------------
    // Calculations
    // -------------------------------------------------------------------------
    const subtotal = useMemo(() => {
      return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }, [cart]);

    const totalWeight = useMemo(() => {
      return cart.reduce((sum, item) => sum + (item.weight || 100) * item.quantity, 0) || 200;
    }, [cart]);

    const effectiveShippingFee = shippingFee !== null ? Number(shippingFee) : 0;
    const effectiveDiscount = Number(discount) || 0;
    const computedTotal = Math.max(0, subtotal + effectiveShippingFee - effectiveDiscount);

    const codAmount = customCod !== null ? Number(customCod) : computedTotal;

    // -------------------------------------------------------------------------
    // Calculate Shipping Fee (window.Api.calculateShipping)
    // -------------------------------------------------------------------------
    const handleCalculateShipping = async () => {
      setIsCalculatingShip(true);
      try {
        if (window.Api && window.Api.calculateShipping) {
          const res = await window.Api.calculateShipping({
            province: province || 'Hà Nội',
            district: district || 'Quận Cầu Giấy',
            address: detailAddress,
            weight: totalWeight,
          });
          const fee = res && typeof res.fee === 'number' ? res.fee : 25000;
          setShippingFee(fee);
        } else {
          // Local fallback calculation
          const norm = (province || '').toLowerCase();
          let fee = 25000;
          if (norm.includes('hà nội') || norm.includes('hồ chí minh') || norm.includes('hcm')) {
            fee = 22000;
          } else if (norm.includes('đà nẵng') || norm.includes('hải phòng') || norm.includes('cần thơ')) {
            fee = 30000;
          } else {
            fee = 35000;
          }
          if (totalWeight > 500) {
            fee += Math.ceil((totalWeight - 500) / 500) * 5000;
          }
          setShippingFee(fee);
        }
      } catch (err) {
        console.error('Lỗi tính phí ship:', err);
        setShippingFee(25000);
      } finally {
        setIsCalculatingShip(false);
      }
    };

    // -------------------------------------------------------------------------
    // Reset Form ("Xóa tất cả")
    // -------------------------------------------------------------------------
    const handleClearAll = () => {
      if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ thông tin đơn hàng này không?')) {
        setName('');
        setPhone('');
        setSearchPhone('');
        setCustomerId('');
        setCustomerStatus(null);
        setProvince('');
        setDistrict('');
        setWard('');
        setDetailAddress('');
        setCart([]);
        setShippingFee(null);
        setDiscount(0);
        setCustomCod(null);
        setNote('');
        setErrors({});
      }
    };

    // -------------------------------------------------------------------------
    // Submit Order ("Tạo đơn")
    // -------------------------------------------------------------------------
    const handleSubmit = async (e) => {
      e?.preventDefault();

      const newErrors = {};
      if (!name.trim()) newErrors.name = true;
      if (!phone.trim()) newErrors.phone = true;
      if (cart.length === 0) newErrors.cart = true;

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        if (newErrors.cart && !newErrors.name && !newErrors.phone) {
          alert('Vui lòng chọn ít nhất 1 sản phẩm vào đơn hàng');
        }
        return;
      }

      setSubmitting(true);
      try {
        const now = new Date();
        const dateCode = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomCode = Math.floor(100 + Math.random() * 900);
        const orderCode = `MP-${dateCode}-${randomCode}`;

        const orderPayload = {
          id: 'ORD-' + Date.now(),
          orderCode,
          customerId: customerId || 'CUST-' + Date.now(),
          customerName: name.trim(),
          customerPhone: phone.trim(),
          shippingAddress: {
            province: province || 'Hà Nội',
            district: district || 'Quận Cầu Giấy',
            ward: ward || '',
            detail: detailAddress || '',
          },
          items: cart.map((i) => ({
            productId: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            weight: i.weight,
            category: i.category,
          })),
          subtotal,
          shippingFee: effectiveShippingFee,
          discount: effectiveDiscount,
          totalAmount: computedTotal,
          codAmount: codAmount,
          note: note.trim(),
          status: 'pending',
          createdBy: currentUser?.uid || 'EMP001',
          createdAt: now.toISOString(),
        };

        // Create via Api if available
        let savedOrder = orderPayload;
        if (window.Api && window.Api.createOrder) {
          savedOrder = await window.Api.createOrder(orderPayload);
        }

        // Notify parent callback
        if (onOrderCreated && typeof onOrderCreated === 'function') {
          onOrderCreated(savedOrder);
        }

        // Show green toast notification
        setToastMessage('Đơn hàng đã được tạo thành công!');

        // Reset cart and custom inputs after order
        setCart([]);
        setCustomCod(null);
        setNote('');
        setShippingFee(null);
        setDiscount(0);
        setErrors({});
      } catch (err) {
        console.error('Tạo đơn thất bại:', err);
        alert('Tạo đơn thất bại, vui lòng thử lại.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="h-full flex flex-col bg-white select-none relative overflow-hidden">
        {/* Header bar */}
        <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <span>📦</span>
              <span>Tạo đơn hàng</span>
            </h2>
            <span className="text-[10px] uppercase font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              GHTK
            </span>
          </div>

          {/* Action: Clear all */}
          <button
            type="button"
            onClick={handleClearAll}
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs font-semibold px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
            title="Xóa toàn bộ biểu mẫu"
          >
            <span>🗑️</span>
            <span>Xóa tất cả</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 scrollbar-thin">
          {/* ===================================================================
              SECTION 1: CUSTOMER INFO
             =================================================================== */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
            {/* Collapsible Header */}
            <div
              onClick={() => setIsCustomerInfoOpen((prev) => !prev)}
              className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">👤</span>
                <span className="font-bold text-xs text-slate-800">Thông tin khách hàng</span>
                {customerStatus === 'existing' && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Khách cũ
                  </span>
                )}
                {customerStatus === 'new' && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Khách mới
                  </span>
                )}
              </div>
              <span className="text-slate-400 text-xs transform transition-transform duration-200">
                {isCustomerInfoOpen ? '▲' : '▼'}
              </span>
            </div>

            {/* Section Content */}
            {isCustomerInfoOpen && (
              <div className="p-3.5 space-y-3">
                {/* Phone Search Box */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Tra cứu khách hàng theo SĐT:
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Nhập SĐT để tìm (09x / 03x)..."
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handlePhoneSearch();
                        }
                      }}
                      className="flex-1 text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handlePhoneSearch}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-indigo-700 font-bold rounded-lg border border-indigo-200 text-xs flex items-center gap-1 transition-colors flex-shrink-0"
                    >
                      <span>🔍</span>
                      <span>Tìm</span>
                    </button>
                  </div>
                </div>

                {/* Customer Details Form */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Họ tên (required) */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                      Họ tên <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Họ và tên khách"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (errors.name) setErrors((prev) => ({ ...prev, name: false }));
                      }}
                      className={`w-full text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none transition-colors ${
                        errors.name
                          ? 'border-rose-500 bg-rose-50 text-rose-900 focus:border-rose-600'
                          : 'border-slate-200 bg-slate-50 focus:border-indigo-500 focus:bg-white'
                      }`}
                      required
                    />
                    {errors.name && <p className="text-[10px] text-rose-500 mt-0.5">Vui lòng nhập họ tên</p>}
                  </div>

                  {/* Số điện thoại (required) */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                      Số điện thoại <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="09x / 03x..."
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (errors.phone) setErrors((prev) => ({ ...prev, phone: false }));
                      }}
                      className={`w-full text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none transition-colors ${
                        errors.phone
                          ? 'border-rose-500 bg-rose-50 text-rose-900 focus:border-rose-600'
                          : 'border-slate-200 bg-slate-50 focus:border-indigo-500 focus:bg-white'
                      }`}
                      required
                    />
                    {errors.phone && <p className="text-[10px] text-rose-500 mt-0.5">Vui lòng nhập SĐT</p>}
                  </div>
                </div>

                {/* Address Dropdowns: Province & District */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                      Tỉnh / Thành phố
                    </label>
                    <select
                      value={province}
                      onChange={(e) => {
                        setProvince(e.target.value);
                        setDistrict(''); // Reset district when province changes
                      }}
                      className="w-full text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="">-- Chọn Tỉnh/TP --</option>
                      {provinceList.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                      Quận / Huyện
                    </label>
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      disabled={!province || districtList.length === 0}
                      className="w-full text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none cursor-pointer disabled:opacity-50"
                    >
                      <option value="">
                        {!province ? '-- Chọn Tỉnh trước --' : '-- Chọn Quận/Huyện --'}
                      </option>
                      {districtList.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Ward & Detail Address */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                      Phường / Xã
                    </label>
                    <input
                      type="text"
                      placeholder="Phường / Xã"
                      value={ward}
                      onChange={(e) => setWard(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                      Địa chỉ chi tiết
                    </label>
                    <input
                      type="text"
                      placeholder="Số nhà, tên đường..."
                      value={detailAddress}
                      onChange={(e) => setDetailAddress(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ===================================================================
              SECTION 2: PRODUCT SELECTION ("Sản phẩm")
             =================================================================== */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
            {/* Header */}
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🛍️</span>
                <span className="font-bold text-xs text-slate-800">Sản phẩm</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                {cart.length} đã chọn
              </span>
            </div>

            <div className="p-3.5 space-y-3">
              {/* Product Search & Filter */}
              <div className="space-y-1.5">
                <input
                  type="text"
                  placeholder="Tìm sản phẩm theo tên, danh mục..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:border-indigo-500 focus:bg-white focus:outline-none"
                />

                {/* Category Chips */}
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${
                        selectedCategory === cat
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat === 'all' ? 'Tất cả' : cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2-Column Product Grid */}
              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                {filteredProducts.map((product) => {
                  const cartItem = cart.find((i) => i.id === product.id);
                  return (
                    <div
                      key={product.id}
                      onClick={() => handleAddToCart(product)}
                      className={`p-2 rounded-xl border cursor-pointer transition-all hover:shadow-md flex flex-col justify-between relative group ${
                        cartItem
                          ? 'border-indigo-500 bg-indigo-50/30 ring-1 ring-indigo-500'
                          : 'border-slate-200 bg-white hover:border-indigo-300'
                      }`}
                    >
                      {cartItem && (
                        <span className="absolute top-1.5 right-1.5 bg-indigo-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                          {cartItem.quantity}
                        </span>
                      )}

                      <div className="flex gap-2 items-center">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0 border border-slate-100"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src =
                              'https://placehold.co/200x200?text=' + encodeURIComponent(product.name);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-slate-800 truncate leading-tight">
                            {product.name}
                          </p>
                          <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-100 text-slate-600 inline-block mt-0.5">
                            {product.category}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="text-xs font-bold text-indigo-600">
                          {product.price.toLocaleString('vi-VN')} đ
                        </span>
                        <span className="text-[10px] text-indigo-600 opacity-0 group-hover:opacity-100 font-bold transition-opacity">
                          + Chọn
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Products List (Cart) */}
              <div className="pt-2 border-t border-slate-200">
                <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                  Giỏ hàng ({cart.length})
                </label>

                {cart.length === 0 ? (
                  <div
                    className={`p-4 rounded-xl border border-dashed text-center text-xs ${
                      errors.cart ? 'border-rose-400 bg-rose-50/40 text-rose-600' : 'border-slate-200 text-slate-400'
                    }`}
                  >
                    Chưa chọn sản phẩm nào
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="p-2 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 truncate text-[11px]">{item.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {item.price.toLocaleString('vi-VN')} đ x {item.quantity} ={' '}
                            <span className="font-bold text-indigo-600">
                              {(item.price * item.quantity).toLocaleString('vi-VN')} đ
                            </span>
                          </p>
                        </div>

                        {/* Quantity Controller & Remove button */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, -1)}
                              disabled={item.quantity <= 1}
                              className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="px-2 py-0.5 text-[11px] font-bold text-slate-800 min-w-[20px] text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, 1)}
                              className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 text-xs font-bold"
                            >
                              +
                            </button>
                          </div>

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCart(item.id)}
                            className="w-6 h-6 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center font-bold text-xs transition-colors"
                            title="Xóa món này"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===================================================================
              SECTION 3: ORDER SUMMARY ("Tổng kết đơn hàng")
             =================================================================== */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">📊</span>
                <span className="font-bold text-xs text-slate-800">Tổng kết đơn hàng</span>
              </div>
            </div>

            <div className="p-3.5 space-y-2.5 text-xs">
              {/* Tạm tính (Subtotal) */}
              <div className="flex items-center justify-between text-slate-600">
                <span>Tạm tính ({cart.reduce((s, i) => s + i.quantity, 0)} món):</span>
                <span className="font-bold text-slate-800">{subtotal.toLocaleString('vi-VN')} đ</span>
              </div>

              {/* Phí vận chuyển */}
              <div className="flex items-center justify-between text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span>Phí vận chuyển:</span>
                  <button
                    type="button"
                    onClick={handleCalculateShipping}
                    disabled={isCalculatingShip}
                    className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md transition-colors"
                  >
                    {isCalculatingShip ? 'Đang tính...' : 'Tính phí ship'}
                  </button>
                </div>
                <span className="font-bold text-slate-800">
                  {shippingFee === null ? (
                    <span className="text-slate-400 font-normal italic">Chưa tính</span>
                  ) : (
                    `${shippingFee.toLocaleString('vi-VN')} đ`
                  )}
                </span>
              </div>

              {/* Giảm giá */}
              <div className="flex items-center justify-between text-slate-600">
                <label htmlFor="discount-input" className="text-slate-600">
                  Giảm giá:
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id="discount-input"
                    type="number"
                    min="0"
                    step="5000"
                    placeholder="0"
                    value={discount || ''}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-24 text-right text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                  <span>đ</span>
                </div>
              </div>

              {/* Thu hộ (COD) */}
              <div className="flex items-center justify-between text-slate-600">
                <label htmlFor="cod-input" className="text-slate-600">
                  Thu hộ (COD):
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id="cod-input"
                    type="number"
                    min="0"
                    placeholder={computedTotal.toString()}
                    value={customCod !== null ? customCod : computedTotal}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomCod(val === '' ? null : Number(val));
                    }}
                    className="w-24 text-right text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:border-indigo-500 focus:bg-white focus:outline-none font-semibold text-slate-800"
                  />
                  <span>đ</span>
                </div>
              </div>

              {/* Tổng cộng */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">Tổng cộng:</span>
                <span className="text-base sm:text-lg font-bold text-indigo-600">
                  {computedTotal.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>
          </div>

          {/* ===================================================================
              SECTION 4: NOTES ("Ghi chú đơn hàng")
             =================================================================== */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">
              Ghi chú đơn hàng
            </label>
            <textarea
              placeholder="Ghi chú đơn hàng (ví dụ: gọi trước khi giao, giao giờ hành chính, bọc kỹ hàng)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows="2"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:bg-white focus:outline-none scrollbar-thin"
            />
          </div>

          {/* ===================================================================
              SECTION 5: ACTION BUTTONS
             =================================================================== */}
          <div className="space-y-2 pt-1">
            {/* Secondary Amber Action: Tính phí ship */}
            <button
              type="button"
              onClick={handleCalculateShipping}
              disabled={isCalculatingShip}
              className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <span>🚚</span>
              <span>{isCalculatingShip ? 'Đang tính phí vận chuyển...' : 'Tính phí ship'}</span>
            </button>

            {/* Primary Indigo Action: Tạo đơn */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang tạo đơn...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Tạo đơn ({computedTotal.toLocaleString('vi-VN')} đ)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* =====================================================================
            SUCCESS GREEN TOAST
           ===================================================================== */}
        {toastMessage && (
          <div className="absolute bottom-4 left-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center justify-between gap-2 animate-bounce">
            <div className="flex items-center gap-2 font-medium text-xs sm:text-sm">
              <span className="text-base font-bold">✓</span>
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-white hover:text-emerald-200 font-bold text-xs"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  }

  // Assign to window object
  if (typeof window !== 'undefined') {
    window.OrderForm = OrderForm;
  }
})();
