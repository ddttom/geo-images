/**
 * Debug Logger Utility
 * 
 * Provides comprehensive logging functionality with multiple levels,
 * file output, and structured logging for debugging and monitoring.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import winston from 'winston';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Log levels
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Color scheme for console output
const LOG_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'grey'
};

/**
 * Create a logger instance with specified configuration
 * @param {string} label - Logger label/name
 * @param {Object} options - Logger configuration options
 * @returns {Object} Winston logger instance
 */
export function createLogger(label = 'GeoImages', options = {}) {
  const {
    level = process.env.LOG_LEVEL || 'info',
    enableConsole = true,
    enableFile = true,
    logDirectory = 'logs',
    maxFiles = 5,
    maxSize = '20m',
    format = 'combined'
  } = options;

  // Ensure log directory exists
  const logDir = join(process.cwd(), logDirectory);
  if (enableFile && !existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Create transports array
  const transports = [];

  // Console transport
  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        level,
        format: winston.format.combine(
          winston.format.colorize({ colors: LOG_COLORS }),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.label({ label }),
          winston.format.printf(({ timestamp, level, label, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${label}] ${level}: ${message}${metaStr}`;
          })
        )
      })
    );
  }

  // File transports
  if (enableFile) {
    // Combined log file
    transports.push(
      new winston.transports.File({
        filename: join(logDir, 'combined.log'),
        level: 'silly',
        maxFiles,
        maxsize: maxSize,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.label({ label }),
          winston.format.json()
        )
      })
    );

    // Error log file
    transports.push(
      new winston.transports.File({
        filename: join(logDir, 'error.log'),
        level: 'error',
        maxFiles,
        maxsize: maxSize,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.label({ label }),
          winston.format.json()
        )
      })
    );

    // Debug log file (if debug level is enabled)
    if (['debug', 'silly'].includes(level)) {
      transports.push(
        new winston.transports.File({
          filename: join(logDir, 'debug.log'),
          level: 'debug',
          maxFiles,
          maxsize: maxSize,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.label({ label }),
            winston.format.json()
          )
        })
      );
    }
  }

  // Create logger
  const logger = winston.createLogger({
    levels: LOG_LEVELS,
    level,
    transports,
    exitOnError: false
  });

  // Add colors to winston
  winston.addColors(LOG_COLORS);

  // Add custom methods
  logger.performance = (message, startTime, metadata = {}) => {
    const duration = Date.now() - startTime;
    logger.info(message, { duration: `${duration}ms`, ...metadata });
  };

  logger.memory = (message, metadata = {}) => {
    const usage = process.memoryUsage();
    logger.debug(message, {
      memory: {
        heapUsed: formatBytes(usage.heapUsed),
        heapTotal: formatBytes(usage.heapTotal),
        external: formatBytes(usage.external),
        rss: formatBytes(usage.rss)
      },
      ...metadata
    });
  };

  logger.progress = (message, current, total, metadata = {}) => {
    const percentage = total > 0 ? ((current / total) * 100).toFixed(1) : 0;
    logger.info(message, {
      progress: {
        current,
        total,
        percentage: `${percentage}%`
      },
      ...metadata
    });
  };

  logger.timing = (operation) => {
    const startTime = Date.now();
    return {
      end: (message, metadata = {}) => {
        logger.performance(message || `${operation} completed`, startTime, metadata);
      }
    };
  };

  return logger;
}

/**
 * Create a structured logger for specific operations
 * @param {string} operation - Operation name
 * @param {Object} context - Operation context
 * @returns {Object} Structured logger
 */
export function createOperationLogger(operation, context = {}) {
  const logger = createLogger(`GeoImages:${operation}`);
  const startTime = Date.now();
  
  return {
    logger,
    startTime,
    
    start: (message, metadata = {}) => {
      logger.info(`Starting ${operation}: ${message}`, { ...context, ...metadata });
    },
    
    progress: (message, current, total, metadata = {}) => {
      logger.progress(`${operation}: ${message}`, current, total, { ...context, ...metadata });
    },
    
    success: (message, metadata = {}) => {
      const duration = Date.now() - startTime;
      logger.info(`${operation} completed: ${message}`, { 
        duration: `${duration}ms`, 
        ...context, 
        ...metadata 
      });
    },
    
    error: (message, error, metadata = {}) => {
      const duration = Date.now() - startTime;
      logger.error(`${operation} failed: ${message}`, { 
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
        ...context, 
        ...metadata 
      });
    },
    
    warn: (message, metadata = {}) => {
      logger.warn(`${operation}: ${message}`, { ...context, ...metadata });
    },
    
    debug: (message, metadata = {}) => {
      logger.debug(`${operation}: ${message}`, { ...context, ...metadata });
    }
  };
}

/**
 * Create a batch processing logger
 * @param {string} batchName - Batch operation name
 * @param {number} totalItems - Total number of items to process
 * @returns {Object} Batch logger
 */
export function createBatchLogger(batchName, totalItems) {
  const logger = createLogger(`GeoImages:Batch:${batchName}`);
  const startTime = Date.now();
  let processedItems = 0;
  let successCount = 0;
  let errorCount = 0;
  
  return {
    logger,
    
    start: () => {
      logger.info(`Starting batch processing: ${batchName}`, {
        totalItems,
        batchSize: totalItems
      });
    },
    
    itemStart: (itemId, metadata = {}) => {
      logger.debug(`Processing item: ${itemId}`, metadata);
    },
    
    itemSuccess: (itemId, metadata = {}) => {
      processedItems++;
      successCount++;
      const progress = ((processedItems / totalItems) * 100).toFixed(1);
      
      logger.debug(`Item completed: ${itemId}`, {
        progress: `${progress}%`,
        processed: processedItems,
        total: totalItems,
        ...metadata
      });
      
      // Log progress every 10% or every 10 items, whichever is smaller
      const progressInterval = Math.min(Math.ceil(totalItems / 10), 10);
      if (processedItems % progressInterval === 0) {
        logger.info(`Batch progress: ${progress}%`, {
          processed: processedItems,
          total: totalItems,
          success: successCount,
          errors: errorCount
        });
      }
    },
    
    itemError: (itemId, error, metadata = {}) => {
      processedItems++;
      errorCount++;
      const progress = ((processedItems / totalItems) * 100).toFixed(1);
      
      logger.error(`Item failed: ${itemId}`, {
        error: error.message,
        progress: `${progress}%`,
        processed: processedItems,
        total: totalItems,
        ...metadata
      });
    },
    
    complete: () => {
      const duration = Date.now() - startTime;
      const successRate = totalItems > 0 ? ((successCount / totalItems) * 100).toFixed(1) : 0;
      
      logger.info(`Batch completed: ${batchName}`, {
        duration: `${duration}ms`,
        totalItems,
        processed: processedItems,
        success: successCount,
        errors: errorCount,
        successRate: `${successRate}%`,
        averageTimePerItem: totalItems > 0 ? `${Math.round(duration / totalItems)}ms` : '0ms'
      });
    }
  };
}

/**
 * Create a performance monitoring logger
 * @param {string} component - Component name
 * @returns {Object} Performance logger
 */
export function createPerformanceLogger(component) {
  const logger = createLogger(`GeoImages:Performance:${component}`);
  const metrics = new Map();
  
  return {
    logger,
    
    startTimer: (operation) => {
      const startTime = Date.now();
      metrics.set(operation, { startTime, samples: [] });
      
      return {
        end: (metadata = {}) => {
          const endTime = Date.now();
          const duration = endTime - startTime;
          const metric = metrics.get(operation);
          
          if (metric) {
            metric.samples.push(duration);
            logger.debug(`${operation} completed`, { 
              duration: `${duration}ms`,
              ...metadata 
            });
          }
          
          return duration;
        }
      };
    },
    
    recordMetric: (name, value, unit = '', metadata = {}) => {
      logger.debug(`Metric recorded: ${name}`, {
        value,
        unit,
        ...metadata
      });
    },
    
    getStats: (operation) => {
      const metric = metrics.get(operation);
      if (!metric || metric.samples.length === 0) {
        return null;
      }
      
      const samples = metric.samples;
      const sum = samples.reduce((a, b) => a + b, 0);
      const avg = sum / samples.length;
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      
      return {
        operation,
        samples: samples.length,
        average: `${Math.round(avg)}ms`,
        min: `${min}ms`,
        max: `${max}ms`,
        total: `${sum}ms`
      };
    },
    
    logStats: () => {
      const allStats = [];
      for (const operation of metrics.keys()) {
        const stats = this.getStats(operation);
        if (stats) {
          allStats.push(stats);
        }
      }
      
      if (allStats.length > 0) {
        logger.info(`Performance statistics for ${component}`, { stats: allStats });
      }
    }
  };
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  
  return `${Math.round(size * 100) / 100} ${sizes[i]}`;
}

/**
 * Create a logger that captures and formats errors
 * @param {string} component - Component name
 * @returns {Object} Error logger
 */
export function createErrorLogger(component) {
  const logger = createLogger(`GeoImages:Error:${component}`);
  
  return {
    logger,
    
    logError: (error, context = {}, metadata = {}) => {
      const errorInfo = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        context,
        ...metadata
      };
      
      // Add additional error details if available
      if (error.code) errorInfo.code = error.code;
      if (error.errno) errorInfo.errno = error.errno;
      if (error.syscall) errorInfo.syscall = error.syscall;
      if (error.path) errorInfo.path = error.path;
      
      logger.error('Error occurred', errorInfo);
    },
    
    logWarning: (message, context = {}, metadata = {}) => {
      logger.warn(message, { context, ...metadata });
    },
    
    logCritical: (error, context = {}, metadata = {}) => {
      const errorInfo = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        context,
        severity: 'CRITICAL',
        ...metadata
      };
      
      logger.error('CRITICAL ERROR', errorInfo);
    }
  };
}

/**
 * Set global log level
 * @param {string} level - Log level
 */
export function setGlobalLogLevel(level) {
  process.env.LOG_LEVEL = level;
}

/**
 * Get current log level
 * @returns {string} Current log level
 */
export function getCurrentLogLevel() {
  return process.env.LOG_LEVEL || 'info';
}

/**
 * Create a logger that outputs to a specific file
 * @param {string} filename - Log file name
 * @param {string} level - Log level
 * @returns {Object} File logger
 */
export function createFileLogger(filename, level = 'info') {
  const logDir = join(process.cwd(), 'logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: join(logDir, filename),
        maxFiles: 5,
        maxsize: '10m'
      })
    ]
  });
}

// Export default logger instance
export const defaultLogger = createLogger();