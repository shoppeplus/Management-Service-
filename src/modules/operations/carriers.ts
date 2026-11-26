import type { CarrierId, ShipmentStatus } from './types'

export interface MockCarrier {
  id: CarrierId
  name: string
  deliveryDays: number
  mode: 'demo'
}

export const CARRIERS: MockCarrier[] = [
  { id: 'demo-express', name: 'Demo Express', deliveryDays: 1, mode: 'demo' },
  { id: 'demo-economy', name: 'Demo Economy', deliveryDays: 3, mode: 'demo' },
]

export const getCarrier = (id: CarrierId) => CARRIERS.find((carrier) => carrier.id === id)
export const trackingDescription = (status: ShipmentStatus) =>
  ({
    ready: 'Vận đơn Demo đã tạo, chờ đơn vị vận chuyển mô phỏng lấy hàng.',
    in_transit: 'Đơn vị vận chuyển mô phỏng đã nhận hàng và đang giao.',
    delivered: 'Mô phỏng giao hàng thành công.',
    exception: 'Mô phỏng sự cố giao hàng, cần liên hệ khách hàng.',
    returned: 'Mô phỏng hoàn hàng về kho.',
    cancelled: 'Vận đơn Demo đã hủy trước khi lấy hàng.',
  })[status]
