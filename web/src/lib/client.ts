import { ServerClock } from './server-clock';
import type { Command, CommandInput, GameResponse } from './types';

export type Snapshot = {
  data: GameResponse | null;
  connection: 'loading' | 'online' | 'offline';
  pending: number;
  restoreRevision: number;
  error: string | null;
  log: { id: number; message: string; event: string }[];
};

type TimedResponse = {
  data: GameResponse;
  receivedAt: number;
  roundTrip: number;
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class GameClient {
  private clock = new ServerClock();
  private dispatchedAt = 0;
  serverNow = () => this.clock.now();
  sinceDispatch = () => performance.now() - this.dispatchedAt;
  private snapshot: Snapshot = {
    data: null,
    connection: 'loading',
    pending: 0,
    restoreRevision: 0,
    error: null,
    log: [],
  };
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private sequence = 0;
  private epoch = 0;
  private started = false;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(partial: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) listener();
  }
  private accept(
    response: TimedResponse,
    partial: Omit<Partial<Snapshot>, 'data'>,
  ) {
    this.clock.sample(
      response.data.serverTime,
      response.receivedAt,
      response.roundTrip,
    );
    this.update({ ...partial, data: response.data });
  }
  private async request(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<TimedResponse> {
    const dispatchedAt = performance.now();
    this.dispatchedAt = dispatchedAt;
    const response = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        data.error || 'The action could not be completed.',
        response.status,
      );
    const receivedAt = performance.now();
    return {
      data: data as GameResponse,
      receivedAt,
      roundTrip: receivedAt - dispatchedAt,
    };
  }
  async start() {
    if (this.started) return;
    this.started = true;
    await this.reconnect();
  }
  async reconnect() {
    const epoch = ++this.epoch;
    this.update({ connection: 'loading', error: null });
    try {
      const response = await this.request('session', 'POST', {});
      if (epoch !== this.epoch) return;
      this.accept(response, {
        connection: 'online',
        error: null,
        restoreRevision: this.snapshot.restoreRevision + 1,
      });
    } catch {
      if (epoch !== this.epoch) return;
      this.update({
        connection: 'offline',
        error:
          'The village is out of reach. Check that the game server and database are running, then reconnect.',
      });
    }
  }
  notice(message: string) {
    this.update({
      log: [
        { id: ++this.sequence, message, event: 'notice' },
        ...this.snapshot.log,
      ].slice(0, 12),
    });
  }
  send(input: CommandInput): Promise<boolean> {
    if (this.snapshot.connection !== 'online' || !this.snapshot.data)
      return Promise.resolve(false);
    const epoch = this.epoch;
    this.update({ pending: this.snapshot.pending + 1 });
    let outcome = false;
    const run = this.queue
      .then(async () => {
        if (
          epoch !== this.epoch ||
          this.snapshot.connection !== 'online' ||
          !this.snapshot.data
        )
          return;
        const command: Command = {
          ...input,
          id: crypto.randomUUID(),
          version: this.snapshot.data.state.version,
        };
        try {
          let response: TimedResponse;
          try {
            response = await this.request('commands', 'POST', command);
          } catch (error) {
            if (epoch !== this.epoch) return;
            if (error instanceof ApiError) throw error;
            // Reuse the receipt key after a lost response; a fresh key could grant the action twice.
            response = await this.request('commands', 'POST', command);
          }
          if (epoch !== this.epoch) return;
          const { data } = response;
          const silent =
            (input.type === 'move' || input.type === 'tick') &&
            (!data.event || data.event === 'move' || data.event === 'tick');
          const log = silent
            ? this.snapshot.log
            : [
                {
                  id: ++this.sequence,
                  message: data.message,
                  event: data.event || input.type,
                },
                ...this.snapshot.log,
              ].slice(0, 12);
          this.accept(response, { error: null, connection: 'online', log });
          outcome = true;
        } catch (error) {
          if (epoch !== this.epoch) return;
          // Commands queued against the discarded prediction cannot use the refreshed version.
          const recoveryEpoch = ++this.epoch;
          if (error instanceof ApiError) {
            this.update({ connection: 'loading' });
            try {
              const response = await this.request('game');
              if (recoveryEpoch !== this.epoch) return;
              this.accept(response, {
                restoreRevision: this.snapshot.restoreRevision + 1,
                connection: 'online',
                error:
                  error.status === 409
                    ? 'Your hero changed in another tab. Progress refreshed; try the action again.'
                    : error.message,
              });
            } catch {
              if (recoveryEpoch !== this.epoch) return;
              this.update({
                connection: 'offline',
                error:
                  'Connection lost. Reconnect to load your last saved progress.',
              });
            }
          } else
            this.update({
              connection: 'offline',
              error:
                'Connection lost. Reconnect to confirm your last saved progress.',
            });
        }
      })
      .finally(() =>
        this.update({ pending: Math.max(0, this.snapshot.pending - 1) }),
      );
    this.queue = run;
    return run.then(() => outcome);
  }
}
