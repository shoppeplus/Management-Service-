export function draftNamespace(mode: 'demo' | 'live', apiBaseUrl = '') {
  return `smartsales-draft:${mode}:${encodeURIComponent(mode === 'demo' ? 'local' : apiBaseUrl || 'unconfigured')}:`
}

export function readDraft(key: string) {
  try {
    return sessionStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export function saveDraft(key: string, text: string) {
  try {
    if (text) sessionStorage.setItem(key, text)
    else sessionStorage.removeItem(key)
  } catch {
    /* Sending remains available when optional draft storage is full. */
  }
}

export function clearDrafts(namespace: string) {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index)
      if (key?.startsWith(namespace)) sessionStorage.removeItem(key)
    }
  } catch {
    /* Resetting the persisted inbox does not depend on draft storage. */
  }
}
