/**
 * CLI Utility
 * 
 * Provides command-line interface utilities including argument parsing,
 * help display, banner generation, and user interaction for geo scanning operations.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';

/**
 * Parse command line arguments for geo scanning
 * @param {Array} args - Command line arguments (default: process.argv.slice(2))
 * @param {Object} options - Parsing options
 * @returns {Object} Parsed arguments object
 */
export function parseArguments(args = process.argv.slice(2), options = {}) {
  const {
    defaultScanDirectory = null,
    supportedFlags = ['--help', '-h', '--verbose', '-v', '--dry-run', '--force']
  } = options;

  const parsed = {
    scanDirectory: null,
    flags: {},
    unknownFlags: [],
    errors: []
  };

  // Process each argument
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      // Long flag
      const flagName = arg.substring(2);
      
      if (supportedFlags.includes(arg)) {
        parsed.flags[flagName] = true;
      } else {
        parsed.unknownFlags.push(arg);
      }
    } else if (arg.startsWith('-')) {
      // Short flag
      if (supportedFlags.includes(arg)) {
        const flagName = arg.substring(1);
        parsed.flags[flagName] = true;
      } else {
        parsed.unknownFlags.push(arg);
      }
    } else {
      // Directory argument
      if (!parsed.scanDirectory) {
        parsed.scanDirectory = resolve(arg);
      } else {
        parsed.errors.push(`Multiple directories specified: ${parsed.scanDirectory} and ${arg}`);
      }
    }
  }

  // Use default directory if none specified
  if (!parsed.scanDirectory && defaultScanDirectory) {
    parsed.scanDirectory = defaultScanDirectory;
  }

  // Validate scan directory
  if (parsed.scanDirectory && !existsSync(parsed.scanDirectory)) {
    parsed.errors.push(`Scan directory does not exist: ${parsed.scanDirectory}`);
  }

  return parsed;
}

/**
 * Display help information for the geo scanning tool
 * @param {Object} options - Help display options
 */
export function displayHelp(options = {}) {
  const {
    toolName = 'create-geo.js',
    description = 'Comprehensive EXIF Metadata Scanner',
    version = null,
    examples = []
  } = options;

  console.log(chalk.blue.bold(`\n🌍 Create Geo - ${description}\n`));
  
  if (version) {
    console.log(chalk.gray(`Version: ${version}\n`));
  }

  console.log(`Usage: node ${toolName} [directory] [options]\n`);
  
  console.log('Arguments:');
  console.log('  directory     Directory to scan for images (default: ~/pics)');
  console.log('                Can be absolute or relative path\n');
  
  console.log('Options:');
  console.log('  --help, -h    Display this help message');
  console.log('  --verbose, -v Enable verbose logging output');
  console.log('  --dry-run     Show what would be processed without making changes');
  console.log('  --force       Force processing even if validation warnings exist\n');
  
  console.log('Examples:');
  console.log(`  node ${toolName}                    # Scan default ~/pics directory`);
  console.log(`  node ${toolName} /path/to/photos    # Scan specific directory`);
  console.log(`  node ${toolName} ./my-photos        # Scan relative directory`);
  console.log(`  node ${toolName} --verbose          # Enable verbose output`);
  console.log(`  node ${toolName} --dry-run ~/pics   # Preview without changes`);
  
  // Add custom examples if provided
  if (examples.length > 0) {
    console.log('\nAdditional Examples:');
    examples.forEach(example => {
      console.log(`  ${example.command.padEnd(35)} # ${example.description}`);
    });
  }
  
  console.log('\nEnvironment Variables:');
  console.log('  DEFAULT_PHOTO_DIR     Default directory to scan');
  console.log('  LOG_LEVEL            Logging level (error, warn, info, debug)');
  console.log('  BATCH_SIZE           Number of images to process per batch');
  console.log('  COORDINATE_TOLERANCE Tolerance for duplicate coordinate detection\n');
}

/**
 * Display application banner
 * @param {Object} options - Banner options
 */
export function displayBanner(options = {}) {
  const {
    title = '🌍 Create Geo - Comprehensive EXIF Scanner',
    subtitle = null,
    version = null,
    author = null
  } = options;

  console.log(chalk.blue.bold(`\n${title}\n`));
  
  if (subtitle) {
    console.log(chalk.cyan(subtitle));
  }
  
  if (version) {
    console.log(chalk.gray(`Version: ${version}`));
  }
  
  if (author) {
    console.log(chalk.gray(`Author: ${author}`));
  }
  
  console.log(); // Empty line
}

/**
 * Display processing start information
 * @param {string} scanDirectory - Directory being scanned
 * @param {Object} config - Configuration object
 */
export function displayProcessingStart(scanDirectory, config = {}) {
  console.log(chalk.green(`Scanning directory: ${scanDirectory}`));
  
  if (config.batchSize) {
    console.log(chalk.gray(`Batch size: ${config.batchSize} images`));
  }
  
  if (config.duplicateDetection?.coordinateTolerance) {
    console.log(chalk.gray(`Coordinate tolerance: ${config.duplicateDetection.coordinateTolerance}°`));
  }
  
  console.log(); // Empty line for spacing
}

/**
 * Display completion message
 * @param {boolean} success - Whether operation completed successfully
 * @param {Object} summary - Operation summary
 */
export function displayCompletion(success, summary = {}) {
  if (success) {
    console.log(chalk.green.bold('\n✅ Geo metadata scanning completed successfully!'));
    
    if (summary.newEntries > 0) {
      console.log(chalk.cyan(`📍 Added ${summary.newEntries} new GPS entries to the database`));
    }
    
    if (summary.duplicatesFound > 0) {
      console.log(chalk.yellow(`🔄 Found and skipped ${summary.duplicatesFound} duplicate entries`));
    }
  } else {
    console.log(chalk.red.bold('\n❌ Geo metadata scanning failed'));
    
    if (summary.errors > 0) {
      console.log(chalk.red(`💥 Encountered ${summary.errors} errors during processing`));
    }
  }
}

/**
 * Display error message with formatting
 * @param {string} message - Error message
 * @param {Error} error - Error object (optional)
 * @param {Object} options - Display options
 */
export function displayError(message, error = null, options = {}) {
  const {
    showStack = false,
    prefix = '❌ Error:'
  } = options;

  console.error(chalk.red.bold(`\n${prefix}`), message);
  
  if (error) {
    if (showStack && error.stack) {
      console.error(chalk.red(error.stack));
    } else if (error.message && error.message !== message) {
      console.error(chalk.red(`Details: ${error.message}`));
    }
  }
}

/**
 * Display warning message with formatting
 * @param {string} message - Warning message
 * @param {Object} options - Display options
 */
export function displayWarning(message, options = {}) {
  const {
    prefix = '⚠️ Warning:'
  } = options;

  console.warn(chalk.yellow.bold(`\n${prefix}`), message);
}

/**
 * Display info message with formatting
 * @param {string} message - Info message
 * @param {Object} options - Display options
 */
export function displayInfo(message, options = {}) {
  const {
    prefix = 'ℹ️ Info:',
    color = 'blue'
  } = options;

  console.log(chalk[color](`${prefix} ${message}`));
}

/**
 * Display progress information
 * @param {string} message - Progress message
 * @param {Object} progress - Progress data
 */
export function displayProgress(message, progress = {}) {
  const {
    current = 0,
    total = 0,
    percentage = null
  } = progress;

  let progressText = message;
  
  if (total > 0) {
    const percent = percentage || ((current / total) * 100).toFixed(1);
    progressText += ` (${current}/${total} - ${percent}%)`;
  }
  
  console.log(chalk.cyan(`⏳ ${progressText}`));
}

/**
 * Create a simple progress bar
 * @param {number} current - Current progress
 * @param {number} total - Total items
 * @param {Object} options - Progress bar options
 * @returns {string} Progress bar string
 */
export function createProgressBar(current, total, options = {}) {
  const {
    width = 40,
    completeChar = '█',
    incompleteChar = '░',
    showPercentage = true
  } = options;

  if (total === 0) {
    return `[${incompleteChar.repeat(width)}] 0%`;
  }

  const percentage = (current / total) * 100;
  const completed = Math.floor((current / total) * width);
  const remaining = width - completed;

  const bar = completeChar.repeat(completed) + incompleteChar.repeat(remaining);
  const percentText = showPercentage ? ` ${percentage.toFixed(1)}%` : '';

  return `[${bar}]${percentText}`;
}

/**
 * Validate CLI arguments and display errors
 * @param {Object} parsed - Parsed arguments from parseArguments
 * @returns {boolean} True if arguments are valid
 */
export function validateArguments(parsed) {
  let isValid = true;

  // Display unknown flags
  if (parsed.unknownFlags.length > 0) {
    displayWarning(`Unknown flags: ${parsed.unknownFlags.join(', ')}`);
    console.log('Use --help to see available options.');
    isValid = false;
  }

  // Display parsing errors
  if (parsed.errors.length > 0) {
    parsed.errors.forEach(error => {
      displayError(error);
    });
    isValid = false;
  }

  return isValid;
}

/**
 * Handle help flag and exit if needed
 * @param {Object} parsed - Parsed arguments
 * @param {Object} helpOptions - Help display options
 * @returns {boolean} True if help was displayed (should exit)
 */
export function handleHelpFlag(parsed, helpOptions = {}) {
  if (parsed.flags.help || parsed.flags.h) {
    displayHelp(helpOptions);
    return true;
  }
  return false;
}

/**
 * Create a formatted table for CLI output
 * @param {Array} data - Array of objects to display
 * @param {Array} columns - Column definitions
 * @param {Object} options - Table options
 */
export function displayTable(data, columns, options = {}) {
  const {
    maxWidth = 120,
    padding = 2,
    headerColor = 'blue',
    borderColor = 'gray'
  } = options;

  if (!Array.isArray(data) || data.length === 0) {
    console.log(chalk.yellow('No data to display'));
    return;
  }

  // Calculate column widths
  const widths = {};
  columns.forEach(col => {
    const key = col.key || col;
    const header = col.header || key;
    
    widths[key] = Math.max(
      header.length,
      ...data.map(row => String(row[key] || '').length)
    );
  });

  // Create header row
  const headerRow = columns.map(col => {
    const key = col.key || col;
    const header = col.header || key;
    return chalk[headerColor](header.padEnd(widths[key]));
  }).join(' | ');

  console.log(headerRow);
  console.log(chalk[borderColor]('-'.repeat(headerRow.replace(/\u001b\[[0-9;]*m/g, '').length)));

  // Create data rows
  data.forEach(row => {
    const dataRow = columns.map(col => {
      const key = col.key || col;
      const value = row[key] || '';
      const formatter = col.formatter || (v => v);
      const color = col.color || 'white';
      
      return chalk[color](String(formatter(value)).padEnd(widths[key]));
    }).join(' | ');
    
    console.log(dataRow);
  });
}

/**
 * Prompt user for confirmation
 * @param {string} message - Confirmation message
 * @param {boolean} defaultValue - Default value if user just presses enter
 * @returns {Promise<boolean>} User's confirmation
 */
export async function promptConfirmation(message, defaultValue = false) {
  const readline = await import('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
    
    rl.question(chalk.yellow(`${message} ${defaultText}: `), (answer) => {
      rl.close();
      
      const normalized = answer.toLowerCase().trim();
      
      if (normalized === '') {
        resolve(defaultValue);
      } else if (normalized === 'y' || normalized === 'yes') {
        resolve(true);
      } else if (normalized === 'n' || normalized === 'no') {
        resolve(false);
      } else {
        resolve(defaultValue);
      }
    });
  });
}

/**
 * Format file path for display (truncate if too long)
 * @param {string} filePath - File path to format
 * @param {number} maxLength - Maximum length (default: 60)
 * @returns {string} Formatted file path
 */
export function formatFilePath(filePath, maxLength = 60) {
  if (filePath.length <= maxLength) {
    return filePath;
  }
  
  const start = filePath.substring(0, Math.floor(maxLength / 2) - 2);
  const end = filePath.substring(filePath.length - Math.floor(maxLength / 2) + 2);
  
  return `${start}...${end}`;
}