import { createContext, useContext } from 'react'
import type { Customer, CustomerInput, InboxData } from '../../types/inbox'
import type { OperationsData, OperationsService } from './types'

export interface OperationsContextValue {
  inbox: InboxData
  data: OperationsData
  service: OperationsService
  busy: boolean
  run: (action: () => Promise<OperationsData>, success?: string) => Promise<OperationsData>
  saveCustomer: (id: string | null, input: CustomerInput) => Promise<Customer>
  refresh: () => Promise<void>
  notify: (text: string, kind?: 'success' | 'error') => void
}
export const OperationsContext = createContext<OperationsContextValue | null>(null)
export function useOperations() {
  const context = useContext(OperationsContext)
  if (!context) throw new Error('OperationsProvider is required')
  return context
}
