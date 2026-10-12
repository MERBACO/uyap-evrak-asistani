/**
 * queue.js — paced work queue.
 *
 * UYAP is a shared public system and it throttles. Hammering it gets a session
 * killed and, worse, degrades the service for everyone else on it. So the
 * extension runs it one task at a time with a deliberate gap between them, and
 * backs off hard when the server pushes back.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TaskQueue {
  /**
   * @param {Object}   opts
   * @param {number}   opts.concurrency   parallel tasks (keep at 1–2)
   * @param {number}   opts.minDelayMs    gap between task starts
   * @param {number}   opts.jitterMs      random extra gap, so requests aren't metronomic
   * @param {number}   opts.maxRetries    attempts after the first failure
   * @param {Function} opts.onProgress    ({done, total, failed, current}) => void
   * @param {Function} opts.onSettled     ({label, ok}) => void — once per started task,
   *                                      after its last attempt, whatever the outcome
   * @param {Object}   opts.izleyici      optional {isBasladi(label), isBitti(label)}: told
   *                                      when each attempt starts and when a task is
   *                                      settled, so a slow task can be named while it runs
   */
  constructor({
    concurrency = 1,
    minDelayMs = 1200,
    jitterMs = 600,
    maxRetries = 2,
    maxDelayMs = 6000,
    onProgress = () => {},
    onSettled = () => {},
    izleyici = null
  } = {}) {
    this.concurrency = Math.max(1, concurrency);
    this.minDelayMs = minDelayMs;
    this.jitterMs = jitterMs;
    this.maxRetries = maxRetries;
    this.maxDelayMs = maxDelayMs;
    this.baseDelayMs = minDelayMs;
    this.ardisikBasari = 0;
    this.onProgress = onProgress;
    this.onSettled = onSettled;
    this.izleyici = izleyici;
    this.sonSonuclar = []; // recent outcomes, for spotting a run going wrong

    this.tasks = [];
    this.results = [];
    this.failures = [];
    this.done = 0;
    this.paused = false;
    this.aborted = false;
    this._lastStart = 0;
  }

  add(label, fn) {
    this.tasks.push({ label, fn });
    return this;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  abort() {
    this.aborted = true;
    this.paused = false;
  }

  /**
   * One start at a time, at least minDelayMs after the previous one. The
   * workers take turns here: two of them used to read the same last start at
   * once and set off together, so at concurrency 2 half the requests ignored
   * the declared spacing.
   */
  _throttle() {
    const sira = (this._throttleSirasi || Promise.resolve()).then(async () => {
      const wait = this.minDelayMs + Math.random() * this.jitterMs;
      const since = Date.now() - this._lastStart;
      if (since < wait) await sleep(wait - since);
      this._lastStart = Date.now();
    });
    this._throttleSirasi = sira.catch(() => {});
    return sira;
  }

  async _runOne(task) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (this.aborted) throw new Error('iptal edildi');
      try {
        await this._throttle();
        // Checked again after the wait: a run stopped during the pause — cancelled,
        // or blocked by UYAP — must not send one last request per worker.
        if (this.aborted) throw new Error('iptal edildi');
        this.izleyici?.isBasladi(task.label);
        const sonuc = await task.fn();

        // Recover from an earlier slowdown. Without this, one 429 near the start
        // penalises every remaining document for the rest of the run.
        this.ardisikBasari = (this.ardisikBasari || 0) + 1;
        if (this.ardisikBasari >= 20 && this.minDelayMs > this.baseDelayMs) {
          this.minDelayMs = Math.max(this.baseDelayMs, Math.round(this.minDelayMs * 0.8));
          this.ardisikBasari = 0;
        }
        return sonuc;
      } catch (err) {
        const retriable = isRetriable(err);
        if (!retriable || attempt === this.maxRetries) throw err;
        // 2s, 6s, 18s — long enough that a busy UYAP has time to recover.
        // Pushback from the server is a signal about the whole run, not just this
        // task: slow every worker down rather than retrying into a busy system.
        this.ardisikBasari = 0;
        if (err?.status === 429 || err?.status === 503) {
          this.minDelayMs = Math.min(this.maxDelayMs, Math.round(this.minDelayMs * 1.6));
        }

        // 1.5s then 4.5s. The old 2/6/18 schedule meant a single unreachable
        // document could hold the queue for half a minute on its own.
        const backoff = 1500 * Math.pow(3, attempt) + Math.random() * 500;
        await sleep(backoff);
      }
    }
  }

  /**
   * Back off when documents start failing, whatever the reason.
   *
   * Only 429 and 503 used to slow the queue down, but an overloaded UYAP refuses
   * documents with an ordinary-looking response instead of a status code. Left
   * unchecked the queue kept its pace and lost most of the run; the failures
   * themselves are the signal.
   */
  _basarisizliktanYavasla() {
    if (this.sonSonuclar.length > 6) this.sonSonuclar.shift();
    if (this.sonSonuclar.length < 4) return;

    const basarisiz = this.sonSonuclar.filter((x) => !x).length;
    if (basarisiz >= 3) {
      this.minDelayMs = Math.min(this.maxDelayMs, Math.round(this.minDelayMs * 1.6));
      this.sonSonuclar = [];
    }
  }

  async run() {
    const workers = Array.from({ length: this.concurrency }, () => this._worker());
    await Promise.all(workers);
    return { results: this.results, failures: this.failures };
  }

  async _worker() {
    while (this.tasks.length) {
      if (this.aborted) return;
      while (this.paused && !this.aborted) await sleep(250);
      if (this.aborted) return;

      const task = this.tasks.shift();
      if (!task) return;

      this.onProgress({
        done: this.done,
        total: this.done + this.tasks.length + 1,
        failed: this.failures.length,
        current: task.label
      });

      let ok = false;
      try {
        const value = await this._runOne(task);
        this.results.push({ label: task.label, value });
        this.sonSonuclar.push(true);
        ok = true;
      } catch (err) {
        this.failures.push({ label: task.label, error: String(err?.message || err) });
        this.sonSonuclar.push(false);
        this._basarisizliktanYavasla();
      } finally {
        // Retries are over: only now is the outcome final. A task that throws
        // may still be retried, so the task itself cannot know this moment.
        try {
          this.izleyici?.isBitti(task.label);
          this.onSettled({ label: task.label, ok });
        } catch {
          /* a broken listener must not take the worker down */
        }
        this.done++;
        this.onProgress({
          done: this.done,
          total: this.done + this.tasks.length,
          failed: this.failures.length,
          current: null
        });
      }
    }
  }
}

/**
 * Lets parallel tasks take one decision each in list order.
 *
 * Duplicate detection needs this: of two documents with the same content, the
 * earlier one must be kept, whichever happens to finish downloading first.
 * Fetches stay parallel; only the verdict waits for its turn.
 *
 * Positions are 0-based and contiguous within one run. Position n may decide
 * once every position below it has been marked done — decided, failed for good,
 * or anything else that settles it. Marking is idempotent and may happen in any
 * order, so a failure far ahead of its turn cannot strand the ones behind it.
 *
 * The earlier version counted positions in the whole listing rather than in the
 * selection, waited for position 0 that nobody ever completed, and was never
 * told about failures: every download with duplicate skipping on hung on its
 * first document.
 */
export function siraKapisi() {
  let siradaki = 0; // lowest position not yet done
  const biten = new Set();
  const bekleyenler = new Map();

  return {
    bekle(konum) {
      if (konum <= siradaki) return Promise.resolve();
      return new Promise((resolve) => {
        const liste = bekleyenler.get(konum) || [];
        liste.push(resolve);
        bekleyenler.set(konum, liste);
      });
    },
    tamamla(konum) {
      if (!Number.isInteger(konum)) return;
      biten.add(konum);
      while (biten.has(siradaki)) siradaki++;
      for (const [k, liste] of bekleyenler) {
        if (k > siradaki) continue;
        for (const resolve of liste) resolve();
        bekleyenler.delete(k);
      }
    }
  };
}

/** 429 and 5xx are worth another try. A 401/403 means the session died — stop. */
export function isRetriable(err) {
  // Some failures say themselves that trying again only makes things worse —
  // UYAP's security block above all (src/lib/engel.js).
  if (err?.kalici) return false;
  const status = err?.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  if (status === 401 || status === 403 || status === 404) return false;
  // Network-level failures (dropped connection, timeout) have no status.
  return status == null;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message || `HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
  }
}
