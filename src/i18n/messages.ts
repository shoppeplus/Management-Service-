export type Locale = 'vi' | 'en'
export const LANGUAGE_STORAGE_KEY = 'smartsales.locale'
export const labels: Record<string, string> = {
  Dashboard: 'Tổng quan',
  Inbox: 'Hộp thư',
  CRM: 'Khách hàng',
  Orders: 'Đơn hàng',
  Products: 'Sản phẩm',
  Inventory: 'Quản lý kho',
  'Market Intelligence': 'Phân tích thị trường',
  Login: 'Đăng nhập',
  Logistics: 'Vận chuyển',
  'Customer Care': 'Chăm sóc khách hàng',
  Automation: 'Tự động hóa',
  Reports: 'Báo cáo',
  Settings: 'Cài đặt',
  'My Inbox': 'Hộp thư của tôi',
  'All Conversations': 'Tất cả hội thoại',
  Unassigned: 'Chưa phân công',
  Mentions: 'Được nhắc đến',
  Bots: 'Trợ lý tự động',
  Teams: 'Nhóm',
  'Priority view': 'Hội thoại ưu tiên',
  Archive: 'Lưu trữ',
  Open: 'Đang mở',
  Pending: 'Chờ xử lý',
  Resolved: 'Đã giải quyết',
  Closed: 'Đã đóng',
  Low: 'Thấp',
  Normal: 'Bình thường',
  High: 'Cao',
  Urgent: 'Khẩn cấp',
  Standard: 'Tiêu chuẩn',
  Silver: 'Bạc',
  Gold: 'Vàng',
  Platinum: 'Bạch kim',
  'Live Chat': 'Chat trực tuyến',
  Shopee: 'Shopee',
  Lazada: 'Lazada',
  'TikTok Shop': 'TikTok Shop',
  'Zalo OA': 'Zalo OA',
}

export const englishMessages: Record<string, string> = {
  'Không thể thực hiện thao tác. Vui lòng thử lại.':
    'Unable to complete this action. Please try again.',
  'Một thao tác đang được xử lý. Vui lòng thử lại sau.':
    'An action is in progress. Please try again shortly.',
  'Đã cập nhật hội thoại.': 'Conversation updated.',
  'Đã lưu thông tin khách hàng.': 'Customer details saved.',
  'Đã thêm ghi chú nội bộ.': 'Internal note added.',
  'Đã gửi tin nhắn Demo trong trình duyệt.': 'Demo message saved in this browser.',
  'API đã tiếp nhận tin nhắn.': 'The API accepted the message.',
  'Đã khôi phục dữ liệu Demo ban đầu.': 'Original Demo data restored.',
  'Mỗi tin nhắn chỉ được đính kèm tối đa 4 tệp.': 'A message can contain up to 4 attachments.',
  'Chọn ảnh PNG/JPEG/WebP/GIF, PDF hoặc TXT hợp lệ; mỗi tệp tối đa 1 MB.':
    'Select a valid PNG/JPEG/WebP/GIF image, PDF or TXT file; each file can be up to 1 MB.',
  'Demo chỉ lưu tệp được chọn tại trình duyệt, không tải tệp từ URL bên ngoài.':
    'Demo only saves files selected in this browser, not files from external URLs.',
  'Không thể đọc dữ liệu Demo trong trình duyệt. Kiểm tra quyền lưu trữ.':
    'Unable to read Demo data. Check browser storage permissions.',
  'Dữ liệu Demo đã lưu bị lỗi. Hãy đặt lại dữ liệu Demo để tiếp tục.':
    'Saved Demo data is corrupted. Reset Demo data to continue.',
  'Dữ liệu Demo đã lưu không hợp lệ. Hãy đặt lại dữ liệu Demo để tiếp tục.':
    'Saved Demo data is invalid. Reset Demo data to continue.',
  'API trả về dữ liệu Inbox không đúng cấu trúc. Vui lòng kiểm tra backend.':
    'The API returned malformed Inbox data. Check the backend.',
  'Không thể lưu thay đổi Demo. Bộ nhớ trình duyệt có thể đã đầy; hãy bỏ bớt tệp đính kèm.':
    'Unable to save Demo changes. Browser storage may be full; remove some attachments.',
  'Không tìm thấy hội thoại.': 'Conversation not found.',
  'Trường hội thoại không được hỗ trợ.': 'This conversation field is not supported.',
  'Trạng thái hội thoại không hợp lệ.': 'Invalid conversation status.',
  'Mức ưu tiên không hợp lệ.': 'Invalid priority.',
  'Nhân viên được chọn không tồn tại.': 'The selected teammate does not exist.',
  'Nhóm được chọn không tồn tại.': 'The selected team does not exist.',
  'Số tin chưa đọc không hợp lệ.': 'Invalid unread message count.',
  'Thời hạn xử lý không hợp lệ.': 'Invalid due date.',
  'Tối đa 10 nhãn, mỗi nhãn từ 1 đến 40 ký tự.':
    'Use up to 10 tags, each containing 1–40 characters.',
  'Không tìm thấy khách hàng.': 'Customer not found.',
  'Khách hàng có email hoặc số điện thoại này đã tồn tại.':
    'A customer with this email address or phone number already exists.',
  'Trường thông tin khách hàng không được hỗ trợ.': 'This customer field is not supported.',
  'Thông tin khách hàng không hợp lệ hoặc quá dài.': 'Customer details are invalid or too long.',
  'Họ tên phải có ít nhất 2 ký tự.': 'Full name must contain at least 2 characters.',
  'Địa chỉ email không hợp lệ.': 'Invalid email address.',
  'Số điện thoại không hợp lệ.': 'Invalid phone number.',
  'Hạng thành viên không hợp lệ.': 'Invalid membership tier.',
  'Loại tin nhắn không hợp lệ.': 'Invalid message type.',
  'Hãy mở lại hội thoại trước khi gửi tin nhắn.': 'Reopen the conversation before sending a reply.',
  'Nội dung tin nhắn không hợp lệ.': 'Invalid message content.',
  'Nhập nội dung hoặc đính kèm tệp trước khi gửi.':
    'Enter a message or attach a file before sending.',
  'Nội dung tin nhắn không được vượt quá 10.000 ký tự.':
    'Messages must not exceed 10,000 characters.',
  'API trả về hội thoại không hợp lệ. Hãy tải lại dữ liệu để đồng bộ.':
    'The API returned an invalid conversation. Reload to sync your data.',
  'Live Mode cần VITE_API_BASE_URL hợp lệ. Chưa kết nối backend.':
    'Live Mode requires a valid VITE_API_BASE_URL. The backend is not connected.',
  'API trả về JSON không hợp lệ. Vui lòng kiểm tra backend.':
    'The API returned invalid JSON. Check the backend.',
  'Không thể kết nối API. Kiểm tra backend và thử lại.':
    'Unable to connect to the API. Check the backend and try again.',
  'API trả về khách hàng không hợp lệ. Hãy tải lại dữ liệu để đồng bộ.':
    'The API returned an invalid customer. Reload to sync your data.',
  'Không cho phép đặt lại dữ liệu trong Live Mode.': 'Resetting data is not allowed in Live Mode.',
  'VITE_APP_MODE phải là demo hoặc live.': 'VITE_APP_MODE must be demo or live.',
  'Chế độ ứng dụng không hợp lệ.': 'Invalid application mode.',
}

export function translateMessage(message: string, locale: Locale) {
  if (locale === 'vi') return message
  const apiError = /^API trả về lỗi (\d+)\. Thay đổi chưa được lưu\.$/.exec(message)
  if (apiError) return `The API returned error ${apiError[1]}. Changes were not saved.`
  return englishMessages[message] || message
}
