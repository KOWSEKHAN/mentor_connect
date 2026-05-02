// backend/src/services/circuitBreakerService.js
/**
 * Simple in-process circuit breaker for the LLM (Ollama) integration.
 *
 * States:
 *   closed    → normal operation — requests flow to LLM
 *   open      → tripped — requests bypass LLM and go straight to fallback
 *   half-open → one test request is allowed; success → closed; failure → re-opens
 *
 * Configuration (env vars):
 *   CB_FAILURE_THRESHOLD   — consecutive failures before tripping  (default: 3)
 *   CB_RESET_TIMEOUT_MS    — time before retrying after open       (default: 120000 = 2 min)
 */
const FAILURE_THRESHOLD = Number(process.env.CB_FAILURE_THRESHOLD || 3);
const RESET_TIMEOUT_MS  = Number(process.env.CB_RESET_TIMEOUT_MS  || 120_000);
const PROMPT_VERSION    = 'v1'; // bump when prompt structure changes

class CircuitBreaker {
  constructor(name) {
    this.name            = name;
    this.state           = 'closed';   // 'closed' | 'open' | 'half-open'
    this.failures        = 0;
    this.lastFailureTime = null;
    this.nextAttemptAt   = null;
    this.totalTrips      = 0;
  }

  /**
   * Returns true if requests should be blocked (circuit is open and test window not reached).
   * Side effect: transitions open → half-open when test window is reached.
   */
  isOpen() {
    if (this.state === 'closed' || this.state === 'half-open') return false;
    // state === 'open'
    if (Date.now() >= this.nextAttemptAt) {
      this.state = 'half-open';
      console.info(`[CB:${this.name}] Entering HALF-OPEN — allowing one test request`);
      return false;
    }
    return true;
  }

  /** Call after a successful LLM response */
  recordSuccess() {
    const wasHalfOpen = this.state === 'half-open';
    this.failures = 0;
    this.state    = 'closed';
    if (wasHalfOpen) {
      console.info(`[CB:${this.name}] Circuit CLOSED — LLM is healthy again`);
    }
  }

  /** Call after a failed LLM response (timeout, bad JSON, etc.) */
  recordFailure() {
    this.failures++;
    this.lastFailureTime = new Date();

    if (this.state === 'half-open' || this.failures >= FAILURE_THRESHOLD) {
      this.state         = 'open';
      this.nextAttemptAt = Date.now() + RESET_TIMEOUT_MS;
      this.totalTrips++;
      console.warn(
        `[CB:${this.name}] Circuit OPENED (trip #${this.totalTrips}) after ${this.failures} failures.`,
        `Will retry at ${new Date(this.nextAttemptAt).toISOString()}`
      );
    }
  }

  getStatus() {
    return {
      name:            this.name,
      state:           this.state,
      failures:        this.failures,
      totalTrips:      this.totalTrips,
      lastFailureTime: this.lastFailureTime,
      nextAttemptAt:   this.nextAttemptAt,
      threshold:       FAILURE_THRESHOLD,
      resetTimeoutMs:  RESET_TIMEOUT_MS,
    };
  }
}

// Single shared instance for the LLM
export const llmCircuitBreaker = new CircuitBreaker('ollama');

// Export PROMPT_VERSION so controllers can store it alongside promptUsed
export { PROMPT_VERSION };
