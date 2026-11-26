import type { InventorySnapshot } from './types'

// Display assistance only: the server rechecks source quantities, serial provenance
// and carrying value atomically when posting.
export function returnUnitCost(
  data: InventorySnapshot,
  sourceDocumentId: string,
  skuId: string,
  quantity: number,
  serialNumbers: string[],
) {
  const source = data.documents.find(
    (document) =>
      document.id === sourceDocumentId && document.type === 'issue' && document.status === 'posted',
  )
  if (!source || !Number.isSafeInteger(quantity) || quantity < 1) return null
  const sourceLines = source.lines.filter((line) => line.skuId === skuId)
  if (!sourceLines.length || sourceLines.some((line) => line.inventoryValue === null)) return null
  const prior = data.documents
    .filter(
      (document) => document.sourceDocumentId === sourceDocumentId && document.status === 'posted',
    )
    .flatMap((document) => document.lines)
    .filter((line) => line.skuId === skuId)
  const sku = data.skus.find((item) => item.id === skuId)
  let value: number
  if (sku?.serialTracked) {
    if (serialNumbers.length !== quantity || new Set(serialNumbers).size !== quantity) return null
    const returned = new Set(prior.flatMap((line) => line.serialNumbers))
    let total = 0
    for (const serial of serialNumbers) {
      const original = sourceLines.find((line) => line.serialNumbers.includes(serial))
      if (!original || original.inventoryValue === null || returned.has(serial)) return null
      const base = Math.floor(original.inventoryValue / original.quantity)
      total +=
        base +
        (original.serialNumbers.indexOf(serial) < original.inventoryValue % original.quantity
          ? 1
          : 0)
    }
    value = total
  } else {
    const remainingQuantity =
      sourceLines.reduce((total, line) => total + line.quantity, 0) -
      prior.reduce((total, line) => total + line.quantity, 0)
    const remainingValue =
      sourceLines.reduce((total, line) => total + (line.inventoryValue ?? 0), 0) -
      prior.reduce((total, line) => total + (line.inventoryValue ?? 0), 0)
    if (quantity > remainingQuantity || remainingQuantity <= 0) return null
    value =
      quantity === remainingQuantity
        ? remainingValue
        : Number(
            (BigInt(remainingValue) * BigInt(quantity) + BigInt(remainingQuantity) / 2n) /
              BigInt(remainingQuantity),
          )
  }
  return Math.round(value / quantity)
}
