/**
 * Diagnostic Logger
 * 
 * Standalone logging system for the timeline diagnostic utility.
 * Provides structured logging with different levels and output modes.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

/**
 * Standalone diagnostic logger class
 */
class DiagnosticLogger {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.quiet = options.quiet || false;
    this.logLevel = options.logLevel || 'info';
    this.enableTimestamps = options.enableTimestamps !== false;
    
    // Log levels with numeric values for comparison
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
    
    this.currentLevel = this.levels[this.logLevel] || this.levels.info;
  }

  /**
   * Set verbose mode
   */
  setVerbose(verbose) {
    this.verbose = verbose;
    if (verbose) {
      this.currentLevel = this.levels.debug;
    }
  }

  /**
   * Set quiet mode
   */
  setQuiet(quiet) {
    this.quiet = quiet;
    if (quiet) {
      this.currentLevel = this.levels.error;
    }
  }

  /**
   * Set log level
   */
  setLogLevel(level) {
    this.logLevel = level;
    this.currentLevel = this.levels[level] || this.levels.info;
  }

  /**
   * Check if a log level should be output
   */
  shouldLog(level) {
    return this.levels[level] <= this.currentLevel;
  }

  /**
   * Format log message with timestamp and level
   */
  formatMessage(level, message, ...args) {
    const timestamp = this.enableTimestamps ? 
      `[${new Date().toISOString()}] ` : '';
    
    const levelPrefix = level.toUpperCase().padEnd(5);
    const formattedMessage = typeof message === 'string' ? 
      message : JSON.stringify(message, null, 2);
    
    let output = `${timestamp}${levelPrefix} ${formattedMessage}`;
    
    // Add additional arguments
    if (args.length > 0) {
      const additionalArgs = args.map(arg => 
        typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)
      ).join(' ');
      output += ` ${additionalArgs}`;
    }
    
    return output;
  }

  /**
   * Log error message
   */
  error(message, ...args) {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, ...args);
      console.error(formatted);
    }
  }

  /**
   * Log warning message
   */
  warn(message, ...args) {
    if (this.shouldLog('warn')) {
      const formatted = this.formatMessage('warn', message, ...args);
      console.warn(formatted);
    }
  }

  /**
   * Log info message
   */
  info(message, ...args) {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, ...args);
      console.log(formatted);
    }
  }

  /**
   * Log debug message
   */
  debug(message, ...args) {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage('debug', message, ...args);
      console.log(formatted);
    }
  }

  /**
   * Log trace message
   */
  trace(message, ...args) {
    if (this.shouldLog('trace')) {
      const formatted = this.formatMessage('trace', message, ...args);
      console.log(formatted);
    }
  }

  /**
   * Log progress information
   */
  progress(message, current, total) {
    if (this.quiet) return;
    
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const progressBar = this.createProgressBar(percentage);
    
    process.stdout.write(`\r${message} ${progressBar} ${percentage}% (${current}/${total})`);
    
    if (current >= total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Create a simple progress bar
   */
  createProgressBar(percentage, width = 20) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }

  /**
   * Log performance timing
   */
  time(label) {
    if (!this.timers) {
      this.timers = new Map();
    }
    
    this.timers.set(label, Date.now());
    this.debug(`Timer started: ${label}`);
  }

  /**
   * End performance timing and log duration
   */
  timeEnd(label) {
    if (!this.timers || !this.timers.has(label)) {
      this.warn(`Timer not found: ${label}`);
      return;
    }
    
    const startTime = this.timers.get(label);
    const duration = Date.now() - startTime;
    this.timers.delete(label);
    
    this.info(`${label}: ${this.formatDuration(duration)}`);
    return duration;
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(milliseconds) {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = ((milliseconds % 60000) / 1000).toFixed(2);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Log memory usage information
   */
  logMemoryUsage(label = 'Memory Usage') {
    if (!this.shouldLog('debug')) return;
    
    const usage = process.memoryUsage();
    const formatBytes = (bytes) => {
      const mb = bytes / 1024 / 1024;
      return `${mb.toFixed(2)} MB`;
    };
    
    this.debug(`${label}:`, {
      rss: formatBytes(usage.rss),
      heapTotal: formatBytes(usage.heapTotal),
      heapUsed: formatBytes(usage.heapUsed),
      external: formatBytes(usage.external)
    });
  }

  /**
   * Log structured data in a readable format
   */
  logStructured(level, label, data) {
    if (!this.shouldLog(level)) return;
    
    this[level](`${label}:`);
    
    if (typeof data === 'object' && data !== null) {
      const formatted = JSON.stringify(data, null, 2);
      const lines = formatted.split('\n');
      lines.forEach(line => {
        this[level](`  ${line}`);
      });
    } else {
      this[level](`  ${data}`);
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context) {
    const childLogger = new DiagnosticLogger({
      verbose: this.verbose,
      quiet: this.quiet,
      logLevel: this.logLevel,
      enableTimestamps: this.enableTimestamps
    });
    
    // Override format message to include context
    const originalFormatMessage = childLogger.formatMessage.bind(childLogger);
    childLogger.formatMessage = (level, message, ...args) => {
      const contextStr = typeof context === 'string' ? 
        context : JSON.stringify(context);
      return originalFormatMessage(level, `[${contextStr}] ${message}`, ...args);
    };
    
    return childLogger;
  }

  /**
   * Log diagnostic summary
   */
  logSummary(summary) {
    if (this.quiet) return;
    
    console.log('\n📊 Diagnostic Summary');
    console.log('═'.repeat(50));
    
    Object.entries(summary).forEach(([key, value]) => {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
      const capitalizedKey = formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1);
      
      if (typeof value === 'object' && value !== null) {
        console.log(`${capitalizedKey}:`);
        Object.entries(value).forEach(([subKey, subValue]) => {
          console.log(`  ${subKey}: ${subValue}`);
        });
      } else {
        console.log(`${capitalizedKey}: ${value}`);
      }
    });
    
    console.log('═'.repeat(50));
  }
}

export default DiagnosticLogger;