import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiInboxService, createDemoInboxService, DEMO_STORAGE_KEY } from './inboxService'
import { createDemoData } from '../data/demo'
import type { Attachment, ConversationPatch } from '../types/inbox'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

const fixedNow = () => new Date('2026-11-17T06:00:00.000Z')

describe('Demo inbox service', () => {
  it('creates canonical customers, persists them and rejects duplicate contact details', async () => {
    const storage = memoryStorage()
    const service = createDemoInboxService({ storage })
    const input = {
      name: 'Đặng Lan Phương',
      phone: '0911223344',
      email: 'phuong@example.com',
      company: 'Phương Studio',
      membership: 'Gold' as const,
      location: 'Quận 1, TP.HCM',
    }
    const customer = await service.createCustomer(input)
    expect(customer).toMatchObject({ ...input, id: 'CUS-011' })
    expect((await createDemoInboxService({ storage }).load()).customers).toContainEqual(customer)
    await expect(
      service.createCustomer({
        ...input,
        email: 'different@example.com',
        phone: '+84 911 223 344',
      }),
    ).rejects.toThrow('đã tồn tại')
    await expect(
      service.createCustomer({ ...input, email: 'PHUONG@example.com', phone: '0900000111' }),
    ).rejects.toThrow('đã tồn tại')
    await expect(service.updateCustomer('CUS-001', { email: input.email })).rejects.toThrow(
      'đã tồn tại',
    )
    expect((await service.load()).customers).toHaveLength(11)
  })

  it('rejects invalid customer creation and does not claim success when persistence fails', async () => {
    const storage = memoryStorage()
    const service = createDemoInboxService({ storage })
    const input = {
      name: 'N',
      phone: '0911223344',
      email: 'test@example.com',
      company: '',
      membership: 'Standard' as const,
      location: '',
    }
    await expect(service.createCustomer(input)).rejects.toThrow()
    await expect(
      service.createCustomer({ ...input, name: 'New Customer', phone: '........' }),
    ).rejects.toThrow('Số điện thoại')
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    await expect(service.createCustomer({ ...input, name: 'New Customer' })).rejects.toThrow(
      'Không thể lưu',
    )
    expect((await service.load()).customers).toHaveLength(10)
  })
  it('loads a deterministic, linked dataset covering every channel', async () => {
    const data = await createDemoInboxService({ storage: memoryStorage() }).load()
    expect(data.customers).toHaveLength(10)
    expect(data.conversations).toHaveLength(15)
    expect(new Set(data.conversations.map((item) => item.channel)).size).toBe(6)
    expect(data.conversations.find((item) => item.id === 'conv-001')).toMatchObject({
      channel: 'instagram',
      priority: 'high',
      assigneeId: 'agent-linh',
    })
    for (const conversation of data.conversations) {
      expect(data.customers.some((customer) => customer.id === conversation.customerId)).toBe(true)
      expect(conversation.messages.length).toBeGreaterThan(0)
    }
  })

  it('returns detached snapshots so callers cannot change stored data', async () => {
    const service = createDemoInboxService({ storage: memoryStorage() })
    const data = await service.load()
    data.customers[0].name = 'Mutated outside service'
    data.conversations[0].messages.length = 0
    const next = await service.load()
    expect(next.customers[0].name).not.toBe('Mutated outside service')
    expect(next.conversations[0].messages.length).toBeGreaterThan(0)
  })

  it('persists assignment, state, tags and customer edits across service reloads', async () => {
    const storage = memoryStorage()
    const service = createDemoInboxService({ storage })
    const data = await service.load()
    const target = data.conversations[0]
    const patch = {
      assigneeId: data.agents[1].id,
      teamId: data.teams[1].id,
      status: 'pending' as const,
      tags: ['VIP', 'Giao hàng'],
    }
    await service.updateConversation(target.id, patch)
    await service.updateCustomer(target.customerId, {
      name: 'Mai Anh Updated',
      email: 'mai.anh@example.com',
    })
    expect(storage.getItem(DEMO_STORAGE_KEY)).not.toBeNull()
    const reloaded = await createDemoInboxService({ storage }).load()
    expect(reloaded.conversations.find((item) => item.id === target.id)).toMatchObject(patch)
    expect(reloaded.customers.find((item) => item.id === target.customerId)).toMatchObject({
      name: 'Mai Anh Updated',
      email: 'mai.anh@example.com',
    })
  })

  it('sends a demo reply and a distinct internal note using the provided clock', async () => {
    const service = createDemoInboxService({ storage: memoryStorage(), now: fixedNow })
    const before = (await service.load()).conversations.find((item) => item.id === 'conv-001')!
    const afterReply = await service.sendMessage(before.id, {
      type: 'outgoing',
      text: '  Đơn hàng đang được kiểm tra.  ',
    })
    expect(afterReply.messages).toHaveLength(before.messages.length + 1)
    expect(afterReply.messages.at(-1)).toMatchObject({
      type: 'outgoing',
      text: 'Đơn hàng đang được kiểm tra.',
      sentAt: fixedNow().toISOString(),
    })
    const afterNote = await service.sendMessage(before.id, {
      type: 'note',
      text: 'Nhờ kho kiểm tra vận đơn.',
    })
    expect(afterNote.messages.at(-1)).toMatchObject({
      type: 'note',
      text: 'Nhờ kho kiểm tra vận đơn.',
    })
    expect(afterNote.messages.at(-1)?.id).not.toBe(afterReply.messages.at(-1)?.id)
  })

  it('reopens resolved conversations on a reply and blocks replies to closed ones', async () => {
    const service = createDemoInboxService({ storage: memoryStorage() })
    await service.updateConversation('conv-001', { status: 'resolved' })
    expect(
      (await service.sendMessage('conv-001', { type: 'outgoing', text: 'Cập nhật mới.' })).status,
    ).toBe('open')
    await service.updateConversation('conv-001', { status: 'closed' })
    await expect(
      service.sendMessage('conv-001', { type: 'outgoing', text: 'Không thể gửi.' }),
    ).rejects.toThrow()
    expect(
      (await service.sendMessage('conv-001', { type: 'note', text: 'Ghi chú sau khi đóng.' }))
        .status,
    ).toBe('closed')
  })

  it('rejects missing records and invalid mutations without applying them', async () => {
    const service = createDemoInboxService({ storage: memoryStorage() })
    const data = await service.load()
    await expect(service.updateConversation('missing', { priority: 'high' })).rejects.toThrow()
    await expect(service.updateCustomer('missing', { name: 'Unknown' })).rejects.toThrow()
    await expect(service.sendMessage('missing', { type: 'note', text: 'Note' })).rejects.toThrow()
    await expect(
      service.sendMessage('conv-001', { type: 'outgoing', text: '   ' }),
    ).rejects.toThrow()
    await expect(
      service.updateConversation('conv-001', { assigneeId: 'unknown-agent' }),
    ).rejects.toThrow()
    await expect(
      service.updateConversation('conv-001', { teamId: 'unknown-team' }),
    ).rejects.toThrow()
    await expect(
      service.updateConversation('conv-001', { status: 'invalid' } as unknown as ConversationPatch),
    ).rejects.toThrow()
    await expect(
      service.updateCustomer(data.customers[0].id, { email: 'invalid-email' }),
    ).rejects.toThrow()
    await expect(
      service.updateCustomer(data.customers[0].id, { phone: 'invalid-phone' }),
    ).rejects.toThrow()
    expect(await service.load()).toEqual(data)
  })

  it('does not publish an in-memory change when local storage fails', async () => {
    let shouldFail = false
    const underlying = memoryStorage()
    const storage = {
      getItem: underlying.getItem,
      setItem(key: string, value: string) {
        if (shouldFail) throw new Error('Quota exceeded')
        underlying.setItem(key, value)
      },
    }
    const service = createDemoInboxService({ storage })
    const before = await service.load()
    shouldFail = true
    await expect(service.updateConversation('conv-001', { priority: 'urgent' })).rejects.toThrow()
    expect(await service.load()).toEqual(before)
  })

  it('resets stored edits to the original demo dataset', async () => {
    const service = createDemoInboxService({ storage: memoryStorage() })
    const before = await service.load()
    await service.updateConversation('conv-001', { tags: ['Changed'], priority: 'urgent' })
    expect(await service.reset()).toEqual(before)
    expect(await service.load()).toEqual(before)
  })

  it('restores conversations while preserving canonical contacts used by other modules', async () => {
    const storage = memoryStorage()
    const service = createDemoInboxService({ storage })
    const created = await service.createCustomer({
      name: 'Khách hàng mới',
      phone: '0911223344',
      email: '',
      company: '',
      membership: 'Standard',
      location: 'Hà Nội',
    })
    await service.updateCustomer('CUS-001', { name: 'Tên đã cập nhật' })
    await service.sendMessage('conv-001', { type: 'note', text: 'Ghi chú cần xóa' })
    const restored = await service.resetConversations()
    expect(restored.customers).toContainEqual(created)
    expect(restored.customers[0].name).toBe('Tên đã cập nhật')
    expect(restored.conversations).toEqual(createDemoData().conversations)
    expect(await createDemoInboxService({ storage }).load()).toEqual(restored)
  })

  it.each([
    '{not valid JSON',
    JSON.stringify({ customers: [], conversations: 'invalid', agents: [], teams: [] }),
  ])('rejects corrupted saved data and allows an explicit reset to recover', async (stored) => {
    const storage = memoryStorage()
    storage.setItem(DEMO_STORAGE_KEY, stored)
    const service = createDemoInboxService({ storage })
    await expect(service.load()).rejects.toThrow()
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(stored)
    const recovered = await service.reset()
    expect(recovered.customers).toHaveLength(10)
    expect(recovered.conversations).toHaveLength(15)
    expect(await service.load()).toEqual(recovered)
    expect(await createDemoInboxService({ storage }).load()).toEqual(recovered)
  })

  it('rejects null records, malformed messages and attachments, and broken entity references', async () => {
    const seed = createDemoData()
    const first = seed.conversations[0]
    const invalidSnapshots = [
      { ...seed, customers: [null, ...seed.customers.slice(1)] },
      { ...seed, conversations: [{ ...first, messages: [null] }, ...seed.conversations.slice(1)] },
      {
        ...seed,
        conversations: [
          { ...first, messages: [{ ...first.messages[0], attachments: [null] }] },
          ...seed.conversations.slice(1),
        ],
      },
      {
        ...seed,
        conversations: [
          { ...first, customerId: 'missing-customer' },
          ...seed.conversations.slice(1),
        ],
      },
      {
        ...seed,
        conversations: [{ ...first, assigneeId: 'missing-agent' }, ...seed.conversations.slice(1)],
      },
      {
        ...seed,
        conversations: [{ ...first, teamId: 'missing-team' }, ...seed.conversations.slice(1)],
      },
    ]
    for (const snapshot of invalidSnapshots) {
      const storage = memoryStorage()
      const serialized = JSON.stringify(snapshot)
      storage.setItem(DEMO_STORAGE_KEY, serialized)
      await expect(createDemoInboxService({ storage }).load()).rejects.toThrow()
      expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(serialized)
    }
  })

  it('persists a selected TXT file through reload without a temporary blob URL', async () => {
    const storage = memoryStorage()
    const service = createDemoInboxService({ storage, now: fixedNow })
    const attachment: Attachment = {
      id: 'file-txt',
      name: 'ghi-chu.txt',
      type: 'text/plain',
      size: 5,
      url: 'data:text/plain;base64,SGVsbG8=',
    }
    const sent = await service.sendMessage('conv-001', {
      type: 'outgoing',
      text: '',
      attachments: [attachment],
    })
    expect(sent.messages.at(-1)?.attachments).toEqual([attachment])
    const reloaded = await createDemoInboxService({ storage }).load()
    expect(
      reloaded.conversations.find((item) => item.id === 'conv-001')?.messages.at(-1)?.attachments,
    ).toEqual([attachment])
  })

  it('rejects too many, oversized, unsupported and unsafe attachments atomically', async () => {
    const service = createDemoInboxService({ storage: memoryStorage() })
    const before = await service.load()
    const file: Attachment = {
      id: 'file-txt',
      name: 'ghi-chu.txt',
      type: 'text/plain',
      size: 5,
      url: 'data:text/plain;base64,SGVsbG8=',
    }
    const invalidAttachments = [
      Array.from({ length: 5 }, (_, index) => ({ ...file, id: `file-${index}` })),
      [{ ...file, size: 1024 * 1024 + 1 }],
      [{ ...file, type: 'text/html', name: 'unsafe.html', url: 'data:text/html;base64,SGVsbG8=' }],
      [{ ...file, url: 'javascript:alert(1)' }],
      [{ ...file, url: 'blob:https://example.com/temporary' }],
      [{ ...file, url: 'https://example.com/external.txt' }],
    ]
    for (const attachments of invalidAttachments) {
      await expect(
        service.sendMessage('conv-001', { type: 'outgoing', text: 'Attachment', attachments }),
      ).rejects.toThrow()
    }
    expect(await service.load()).toEqual(before)
  })
})

describe('Live inbox adapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates canonical contacts through the API and rejects duplicate IDs or malformed responses', async () => {
    const seed = createDemoData()
    const { id: existingId, avatarColor, ...input } = seed.customers[0]
    const created = { ...input, id: 'CUS-011', avatarColor }
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response(JSON.stringify(seed), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const service = createApiInboxService('https://api.example.com/api')
    await service.load()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }))
    expect(await service.createCustomer(input)).toEqual(created)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.com/api/customers',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(input),
      }),
    )
    for (const invalid of [{ ...created, id: existingId }, created, { id: 'CUS-012' }]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(invalid), { status: 200 }))
      await expect(service.createCustomer(input)).rejects.toThrow('khách hàng không hợp lệ')
    }
    await expect(service.resetConversations()).rejects.toThrow('Live Mode')
  })

  it.each(['', '/api', 'not-a-url', 'file:///api', 'javascript:alert(1)'])(
    'rejects a missing or invalid base URL before making a request',
    async (baseUrl) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      await expect(createApiInboxService(baseUrl).load()).rejects.toThrow()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('uses the documented methods, encoded IDs and session credentials', async () => {
    const data = createDemoData()
    const fetchMock = vi.fn().mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/customers/')
              ? { ...data.customers[0], id: 'customer/1' }
              : { ...data.conversations[0], id: 'conversation/with #spaces' },
          ),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const service = createApiInboxService('https://api.example.com/api/')
    const id = 'conversation/with #spaces'
    await service.updateConversation(id, { status: 'pending' })
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.com/api/conversations/conversation%2Fwith%20%23spaces',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({ status: 'pending' }),
      }),
    )
    await service.updateCustomer('customer/1', { name: 'Mai Anh' })
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.com/api/customers/customer%2F1',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({ name: 'Mai Anh' }),
      }),
    )
    await service.sendMessage(id, { type: 'outgoing', text: 'Xin chào' })
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.com/api/conversations/conversation%2Fwith%20%23spaces/messages',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ type: 'outgoing', text: 'Xin chào' }),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      }),
    )
    fetchMock.mockImplementationOnce(
      async () => new Response(JSON.stringify(data), { status: 200 }),
    )
    expect(await service.load()).toEqual(data)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.com/api/inbox',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      }),
    )
  })

  it('reports API failures and never falls back to demo data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const service = createApiInboxService('https://api.example.com/api')
    await expect(service.load()).rejects.toThrow('503')
    await expect(service.updateConversation('conv-001', { status: 'resolved' })).rejects.toThrow(
      '503',
    )
    await expect(service.reset()).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed mutation responses and records belonging to another ID', async () => {
    const data = createDemoData()
    const service = createApiInboxService('https://api.example.com/api')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const response of [
      null,
      {},
      { ...data.conversations[0], id: 'wrong-id' },
      { ...data.conversations[0], messages: [null] },
    ]) {
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify(response), { status: 200 }),
      )
      await expect(service.updateConversation('conv-001', { status: 'pending' })).rejects.toThrow()
    }
    for (const response of [
      null,
      { id: data.customers[0].id },
      { ...data.customers[0], id: 'wrong-id' },
    ]) {
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify(response), { status: 200 }),
      )
      await expect(
        service.updateCustomer(data.customers[0].id, { name: 'Mai Anh' }),
      ).rejects.toThrow()
    }
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ ...data.conversations[0], id: 'wrong-id' }), { status: 200 }),
    )
    await expect(
      service.sendMessage('conv-001', { type: 'outgoing', text: 'Hello' }),
    ).rejects.toThrow()
  })

  it('reports invalid JSON from successful HTTP responses instead of accepting it', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response('{invalid JSON', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const service = createApiInboxService('https://api.example.com/api')
    await expect(service.load()).rejects.toThrow('JSON')
    await expect(service.updateConversation('conv-001', { status: 'pending' })).rejects.toThrow(
      'JSON',
    )
  })

  it('rejects a mutation referencing a customer absent from the loaded inbox', async () => {
    const data = createDemoData()
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response(JSON.stringify(data), { status: 200 }))
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({ ...data.conversations[0], customerId: 'missing-customer' }),
            { status: 200 },
          ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const service = createApiInboxService('https://api.example.com/api')
    await service.load()
    await expect(
      service.updateConversation(data.conversations[0].id, { status: 'pending' }),
    ).rejects.toThrow()
  })
})
