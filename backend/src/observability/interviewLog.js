import { logger } from './logger.js';

/**
 * Explainable, grep-friendly logs for demos and interviews.
 */
export function logMentorAction(action, meta = {}) {
  logger.info('MENTOR_ACTION', { action, ...meta });
}

export function logSystemEvent(event, meta = {}) {
  logger.info('SYSTEM_EVENT', { event, ...meta });
}

export function logSyncRecovery(meta = {}) {
  logger.info('SYNC_RECOVERY', meta);
}
