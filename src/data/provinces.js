/**
 * Vietnamese Provinces & Districts
 * ─────────────────────────────────
 * Reference data for the top cities / provinces used during order creation
 * and customer address management.
 *
 * This is a simplified subset — a production app would use the full GHN / GHTK
 * province API or the official General Statistics Office list (~63 provinces).
 */

export const provinces = [
  { id: 1, name: 'Hà Nội', code: 'HN' },
  { id: 2, name: 'Hồ Chí Minh', code: 'HCM' },
  { id: 3, name: 'Đà Nẵng', code: 'DN' },
  { id: 4, name: 'Hải Phòng', code: 'HP' },
  { id: 5, name: 'Cần Thơ', code: 'CT' },
  { id: 6, name: 'Bình Dương', code: 'BD' },
  { id: 7, name: 'Đồng Nai', code: 'DNA' },
  { id: 8, name: 'Khánh Hòa', code: 'KH' },
  { id: 9, name: 'Thừa Thiên Huế', code: 'TTH' },
  { id: 10, name: 'Bắc Ninh', code: 'BN' },
];

export const districts = {
  // ── Hà Nội ──────────────────────────────────────
  1: [
    { id: 101, name: 'Quận Ba Đình' },
    { id: 102, name: 'Quận Hoàn Kiếm' },
    { id: 103, name: 'Quận Tây Hồ' },
    { id: 104, name: 'Quận Long Biên' },
    { id: 105, name: 'Quận Cầu Giấy' },
    { id: 106, name: 'Quận Đống Đa' },
    { id: 107, name: 'Quận Hai Bà Trưng' },
    { id: 108, name: 'Quận Hoàng Mai' },
    { id: 109, name: 'Quận Thanh Xuân' },
    { id: 110, name: 'Quận Nam Từ Liêm' },
    { id: 111, name: 'Quận Bắc Từ Liêm' },
    { id: 112, name: 'Quận Hà Đông' },
  ],

  // ── Hồ Chí Minh ────────────────────────────────
  2: [
    { id: 201, name: 'Quận 1' },
    { id: 202, name: 'Quận 3' },
    { id: 203, name: 'Quận 4' },
    { id: 204, name: 'Quận 5' },
    { id: 205, name: 'Quận 7' },
    { id: 206, name: 'Quận 10' },
    { id: 207, name: 'Quận Bình Thạnh' },
    { id: 208, name: 'Quận Gò Vấp' },
    { id: 209, name: 'Quận Phú Nhuận' },
    { id: 210, name: 'Quận Tân Bình' },
    { id: 211, name: 'Thành phố Thủ Đức' },
    { id: 212, name: 'Quận Bình Tân' },
  ],

  // ── Đà Nẵng ────────────────────────────────────
  3: [
    { id: 301, name: 'Quận Hải Châu' },
    { id: 302, name: 'Quận Thanh Khê' },
    { id: 303, name: 'Quận Sơn Trà' },
    { id: 304, name: 'Quận Ngũ Hành Sơn' },
    { id: 305, name: 'Quận Liên Chiểu' },
    { id: 306, name: 'Quận Cẩm Lệ' },
    { id: 307, name: 'Huyện Hòa Vang' },
  ],

  // ── Hải Phòng ──────────────────────────────────
  4: [
    { id: 401, name: 'Quận Hồng Bàng' },
    { id: 402, name: 'Quận Ngô Quyền' },
    { id: 403, name: 'Quận Lê Chân' },
    { id: 404, name: 'Quận Hải An' },
    { id: 405, name: 'Quận Kiến An' },
    { id: 406, name: 'Quận Đồ Sơn' },
  ],

  // ── Cần Thơ ────────────────────────────────────
  5: [
    { id: 501, name: 'Quận Ninh Kiều' },
    { id: 502, name: 'Quận Bình Thủy' },
    { id: 503, name: 'Quận Cái Răng' },
    { id: 504, name: 'Quận Ô Môn' },
    { id: 505, name: 'Quận Thốt Nốt' },
  ],

  // ── Bình Dương ─────────────────────────────────
  6: [
    { id: 601, name: 'Thành phố Thủ Dầu Một' },
    { id: 602, name: 'Thành phố Dĩ An' },
    { id: 603, name: 'Thành phố Thuận An' },
    { id: 604, name: 'Thị xã Bến Cát' },
    { id: 605, name: 'Thị xã Tân Uyên' },
  ],

  // ── Đồng Nai ───────────────────────────────────
  7: [
    { id: 701, name: 'Thành phố Biên Hòa' },
    { id: 702, name: 'Thành phố Long Khánh' },
    { id: 703, name: 'Huyện Long Thành' },
    { id: 704, name: 'Huyện Nhơn Trạch' },
    { id: 705, name: 'Huyện Trảng Bom' },
  ],

  // ── Khánh Hòa ──────────────────────────────────
  8: [
    { id: 801, name: 'Thành phố Nha Trang' },
    { id: 802, name: 'Thành phố Cam Ranh' },
    { id: 803, name: 'Thị xã Ninh Hòa' },
  ],

  // ── Thừa Thiên Huế ─────────────────────────────
  9: [
    { id: 901, name: 'Thành phố Huế' },
    { id: 902, name: 'Thị xã Hương Thủy' },
    { id: 903, name: 'Thị xã Hương Trà' },
  ],

  // ── Bắc Ninh ───────────────────────────────────
  10: [
    { id: 1001, name: 'Thành phố Bắc Ninh' },
    { id: 1002, name: 'Thành phố Từ Sơn' },
    { id: 1003, name: 'Huyện Yên Phong' },
    { id: 1004, name: 'Huyện Quế Võ' },
  ],
};
