const BASE_URL = 'https://api.heycall-e.com'
const TERMINAL = new Set(['completed', 'failed', 'canceled'])

export interface CalleClientOptions {
  apiKey: string
  fetch?: typeof globalThis.fetch
  sleep?: (ms: number) => Promise<void>
  pollIntervalMs?: number
  maxPolls?: number
}

export interface PlaceCallInput {
  task: string
  phone: string
  idempotencyKey: string
  resultSchema?: Record<string, unknown>
}

export interface CalleCall {
  id: string
  status: string
  [key: string]: unknown
}

export class CalleClient {
  private readonly apiKey: string
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly pollIntervalMs: number
  private readonly maxPolls: number

  constructor(options: CalleClientOptions) {
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.pollIntervalMs = options.pollIntervalMs ?? 10_000
    this.maxPolls = options.maxPolls ?? 45
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...extra,
    }
  }

  private async readJson(response: Response): Promise<CalleCall> {
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`CALL-E responded ${response.status}: ${body.slice(0, 300)}`)
    }
    return (await response.json()) as CalleCall
  }

  async placeCall(input: PlaceCallInput): Promise<CalleCall> {
    const body: Record<string, unknown> = {
      task: input.task,
      recipients: [{ phones: [input.phone], locale: 'en-US', region: 'US' }],
    }
    if (input.resultSchema) body.result_schema = input.resultSchema

    const response = await this.fetchImpl(`${BASE_URL}/v1/calls`, {
      method: 'POST',
      headers: this.headers({ 'Idempotency-Key': input.idempotencyKey }),
      body: JSON.stringify(body),
    })

    return this.readJson(response)
  }

  async getCall(callId: string): Promise<CalleCall> {
    const response = await this.fetchImpl(`${BASE_URL}/v1/calls/${callId}`, {
      headers: this.headers(),
    })
    return this.readJson(response)
  }

  async waitForCall(callId: string): Promise<CalleCall> {
    let last: CalleCall | undefined

    for (let i = 0; i < this.maxPolls; i++) {
      last = await this.getCall(callId)
      if (TERMINAL.has(last.status)) return last
      await this.sleep(this.pollIntervalMs)
    }

    throw new Error(
      `Call ${callId} did not reach a terminal status after ${this.maxPolls} polls ` +
        `(last status: ${last?.status ?? 'unknown'}).`,
    )
  }
}
