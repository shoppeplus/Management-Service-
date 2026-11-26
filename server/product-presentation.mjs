import { DomainError } from './database.mjs'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
export const boundedText = (value, max) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max &&
  !Array.from(value).some((character) => character.charCodeAt(0) < 32 && ![9,10,13].includes(character.charCodeAt(0)))
const publicUrl = (value, rootRelative = false) => {
  if (!boundedText(value, 2048) || /[\s\\]/.test(value) || /%(?![a-f\d]{2})/i.test(value)) return false
  const relative = value.startsWith('/') && !value.startsWith('//')
  if (!(rootRelative && relative) && !/^https?:\/\/[^/]/i.test(value)) return false
  try {
    const url = new URL(value, 'https://catalog.invalid')
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && (!relative || url.origin === 'https://catalog.invalid')
  } catch { return false }
}
const validSpecifications = (value) => Array.isArray(value) && value.length <= 12 && value.every((spec) =>
  isObject(spec) && boundedText(spec.label,80) && boundedText(spec.value,240) && Object.keys(spec).every((key) => ['label','value'].includes(key)))

// Arbitrary metadata may hold private business data. Only presentation fields
// explicitly permitted here can enter the customer-facing catalog.
export function publicPresentation(metadata) {
  if (!isObject(metadata)) return {}
  return {
    ...(publicUrl(metadata.imageUrl, true) ? { imageUrl: metadata.imageUrl } : {}),
    ...(boundedText(metadata.description, 2000) ? { description: metadata.description.trim() } : {}),
    ...(publicUrl(metadata.sourceUrl) ? { sourceUrl: metadata.sourceUrl } : {}),
    ...(validSpecifications(metadata.specifications)
      ? { specifications: metadata.specifications.map((spec) => ({ label: spec.label.trim(), value: spec.value.trim() })) }
      : {}),
  }
}

export function updatePresentation(metadata, input) {
  const next = { ...metadata }
  for (const key of ['imageUrl','description','sourceUrl','specifications']) {
    if (!Object.hasOwn(input, key)) continue
    const value = input[key]
    if (value === null || value === '') {
      delete next[key]
      continue
    }
    const valid = key === 'specifications' ? validSpecifications(value) : key === 'description' ? boundedText(value,2000) : publicUrl(value,key === 'imageUrl')
    if (!valid) throw new DomainError(422,'INVALID_INPUT',`Thông tin trình bày sản phẩm ${key} không hợp lệ.`)
    next[key] = key === 'specifications' ? value.map((spec) => ({label:spec.label.trim(),value:spec.value.trim()})) : value.trim()
  }
  return next
}
