/**
 * File Operations Utility
 * 
 * Provides file system operations for geo scanning including backup creation,
 * atomic write operations, file hash calculation, and directory management.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { readFile, writeFile, copyFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';

/**
 * Calculate MD5 hash of a file for duplicate detection
 * @param {string} filePath - Path to the file
 * @returns {Promise<string|null>} File hash or null if calculation fails
 */
export async function calculateFileHash(filePath) {
  try {
    const fileBuffer = await readFile(filePath);
    return createHash('md5').update(fileBuffer).digest('hex');
  } catch (error) {
    return null;
  }
}

/**
 * Create atomic backup of a file
 * @param {string} filePath - Path to the file to backup
 * @param {string} backupSuffix - Suffix to add to backup filename (default: timestamp)
 * @returns {Promise<string|null>} Backup file path or null if no backup needed
 */
export async function createBackup(filePath, backupSuffix = null) {
  if (!existsSync(filePath)) {
    return null;
  }
  
  const suffix = backupSuffix || `backup.${Date.now()}`;
  const backupPath = `${filePath}.${suffix}`;
  
  try {
    await copyFile(filePath, backupPath);
    return backupPath;
  } catch (error) {
    throw new Error(`Failed to create backup: ${error.message}`);
  }
}

/**
 * Ensure directory exists, creating it if necessary
 * @param {string} dirPath - Directory path to ensure
 * @returns {Promise<void>}
 */
export async function ensureDirectory(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Atomic write operation with backup and rollback capability
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 * @param {Object} options - Write options
 * @param {string} options.encoding - File encoding (default: 'utf8')
 * @param {string|null} options.backupPath - Existing backup path for rollback
 * @param {Function|null} options.validator - Content validation function
 * @returns {Promise<void>}
 */
export async function atomicWrite(filePath, content, options = {}) {
  const {
    encoding = 'utf8',
    backupPath = null,
    validator = null
  } = options;
  
  // Ensure target directory exists
  const targetDir = dirname(filePath);
  await ensureDirectory(targetDir);
  
  // Create temporary file path
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  
  try {
    // Write to temporary file
    await writeFile(tempPath, content, encoding);
    
    // Validate content if validator provided
    if (validator) {
      const writtenContent = await readFile(tempPath, encoding);
      const isValid = await validator(writtenContent, content);
      if (!isValid) {
        throw new Error('Content validation failed after write');
      }
    }
    
    // Atomic move (copy + unlink for cross-platform compatibility)
    await copyFile(tempPath, filePath);
    
    // Clean up temporary file
    try {
      await unlink(tempPath);
    } catch (unlinkError) {
      // Log warning but don't fail the operation
      console.warn(`Warning: Could not remove temporary file ${tempPath}: ${unlinkError.message}`);
    }
    
  } catch (error) {
    // Clean up temporary file on error
    try {
      if (existsSync(tempPath)) {
        await unlink(tempPath);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    // Attempt rollback if backup exists
    if (backupPath && existsSync(backupPath)) {
      try {
        await copyFile(backupPath, filePath);
        throw new Error(`Write failed, rolled back to backup: ${error.message}`);
      } catch (rollbackError) {
        throw new Error(`Write failed and rollback failed: ${rollbackError.message}`);
      }
    }
    
    throw new Error(`Atomic write failed: ${error.message}`);
  }
}

/**
 * Atomic write for JSON data with validation
 * @param {string} filePath - Target file path
 * @param {any} data - Data to write as JSON
 * @param {Object} options - Write options
 * @param {string|null} options.backupPath - Existing backup path for rollback
 * @param {number} options.indent - JSON indentation (default: 2)
 * @param {Function|null} options.validator - Data validation function
 * @returns {Promise<void>}
 */
export async function atomicWriteJSON(filePath, data, options = {}) {
  const {
    backupPath = null,
    indent = 2,
    validator = null
  } = options;
  
  // JSON validator that checks parsing and data integrity
  const jsonValidator = async (writtenContent, originalContent) => {
    try {
      const parsedData = JSON.parse(writtenContent);
      
      // Use custom validator if provided
      if (validator) {
        return await validator(parsedData, data);
      }
      
      // Default validation: check array length for arrays
      if (Array.isArray(data)) {
        return Array.isArray(parsedData) && parsedData.length === data.length;
      }
      
      // Default validation: check object keys for objects
      if (typeof data === 'object' && data !== null) {
        return typeof parsedData === 'object' && 
               parsedData !== null &&
               Object.keys(parsedData).length === Object.keys(data).length;
      }
      
      return true;
    } catch (parseError) {
      return false;
    }
  };
  
  const jsonContent = JSON.stringify(data, null, indent);
  
  await atomicWrite(filePath, jsonContent, {
    encoding: 'utf8',
    backupPath,
    validator: jsonValidator
  });
}

/**
 * Safe file deletion with backup option
 * @param {string} filePath - File path to delete
 * @param {boolean} createBackup - Whether to create backup before deletion
 * @returns {Promise<string|null>} Backup path if created, null otherwise
 */
export async function safeDelete(filePath, createBackup = false) {
  if (!existsSync(filePath)) {
    return null;
  }
  
  let backupPath = null;
  
  if (createBackup) {
    backupPath = await createBackup(filePath, `deleted.${Date.now()}`);
  }
  
  try {
    await unlink(filePath);
    return backupPath;
  } catch (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Copy file with error handling and progress callback
 * @param {string} sourcePath - Source file path
 * @param {string} targetPath - Target file path
 * @param {Object} options - Copy options
 * @param {boolean} options.overwrite - Whether to overwrite existing files
 * @param {Function|null} options.progressCallback - Progress callback function
 * @returns {Promise<void>}
 */
export async function safeCopy(sourcePath, targetPath, options = {}) {
  const {
    overwrite = false,
    progressCallback = null
  } = options;
  
  if (!existsSync(sourcePath)) {
    throw new Error(`Source file does not exist: ${sourcePath}`);
  }
  
  if (!overwrite && existsSync(targetPath)) {
    throw new Error(`Target file already exists: ${targetPath}`);
  }
  
  // Ensure target directory exists
  const targetDir = dirname(targetPath);
  await ensureDirectory(targetDir);
  
  try {
    if (progressCallback) {
      progressCallback({ stage: 'starting', source: sourcePath, target: targetPath });
    }
    
    await copyFile(sourcePath, targetPath);
    
    if (progressCallback) {
      progressCallback({ stage: 'completed', source: sourcePath, target: targetPath });
    }
  } catch (error) {
    if (progressCallback) {
      progressCallback({ stage: 'error', source: sourcePath, target: targetPath, error });
    }
    throw new Error(`Failed to copy file: ${error.message}`);
  }
}

/**
 * Get file size in bytes
 * @param {string} filePath - File path
 * @returns {Promise<number>} File size in bytes
 */
export async function getFileSize(filePath) {
  try {
    const stats = await import('fs/promises').then(fs => fs.stat(filePath));
    return stats.size;
  } catch (error) {
    throw new Error(`Failed to get file size: ${error.message}`);
  }
}

/**
 * Check if file is readable and writable
 * @param {string} filePath - File path to check
 * @returns {Promise<Object>} Object with readable and writable properties
 */
export async function checkFilePermissions(filePath) {
  try {
    const fs = await import('fs/promises');
    
    let readable = false;
    let writable = false;
    
    try {
      await fs.access(filePath, (await import('fs')).constants.R_OK);
      readable = true;
    } catch {
      // File not readable
    }
    
    try {
      await fs.access(filePath, (await import('fs')).constants.W_OK);
      writable = true;
    } catch {
      // File not writable
    }
    
    return { readable, writable };
  } catch (error) {
    return { readable: false, writable: false };
  }
}

/**
 * Create a temporary file with automatic cleanup
 * @param {string} content - Content to write to temporary file
 * @param {Object} options - Options
 * @param {string} options.prefix - Filename prefix
 * @param {string} options.suffix - Filename suffix
 * @param {string} options.encoding - File encoding
 * @returns {Promise<Object>} Object with path and cleanup function
 */
export async function createTempFile(content, options = {}) {
  const {
    prefix = 'temp',
    suffix = '.tmp',
    encoding = 'utf8'
  } = options;
  
  const tempPath = join(process.cwd(), 'temp', `${prefix}.${Date.now()}.${Math.random().toString(36).substr(2, 9)}${suffix}`);
  
  // Ensure temp directory exists
  await ensureDirectory(dirname(tempPath));
  
  try {
    await writeFile(tempPath, content, encoding);
    
    return {
      path: tempPath,
      cleanup: async () => {
        try {
          if (existsSync(tempPath)) {
            await unlink(tempPath);
          }
        } catch (error) {
          console.warn(`Warning: Could not clean up temporary file ${tempPath}: ${error.message}`);
        }
      }
    };
  } catch (error) {
    throw new Error(`Failed to create temporary file: ${error.message}`);
  }
}