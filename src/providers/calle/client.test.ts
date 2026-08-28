import { describe, expect, it, vi } from 'vitest'
import { CalleClient } from './client.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('CalleClient', () => {
  it('sends the API key and an idempotency key when placing a call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'call_1', status: 'queued' }))
    const client = new CalleClient({ apiKey: 'k', fetch: fetchMock })

    await client.placeCall({ task: 'hello', phone: '+12532158782', idempotencyKey: 'probe-9' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.heycall-e.com/v1/calls')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer k')
    expect(headers['Idempotency-Key']).toBe('probe-9')
    expect(JSON.parse(String(init.body)).recipients[0].phones).toEqual(['+12532158782'])
  })

  it('throws with the status code when the API rejects the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 401))
    const client = new CalleClient({ apiKey: 'bad', fetch: fetchMock })

    await expect(
      client.placeCall({ task: 't', phone: '+12532158782', idempotencyKey: 'i' }),
    ).rejects.toThrow('CALL-E responded 401')
  })

  it('polls until the call reaches a terminal status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'call_1', status: 'in_progress' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'call_1', status: 'completed' }))
    const client = new CalleClient({ apiKey: 'k', fetch: fetchMock, sleep: async () => {} })

    const final = await client.waitForCall('call_1')

    expect(final.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
