/**
 * File Discovery Service
 * 
 * Handles recursive scanning of directories to find image files
 * and provides metadata about discovered files.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';

/**
 * Service for discovering and cataloging image files
 */
class FileDiscoveryService {
  constructor(logger) {
    this.logger = logger;
    
    // Supported image formats based on PRD specifications
    this.supportedFormats = new Set([
      // Standard formats
      '.jpg', '.jpeg', '.tiff', '.tif', '.png', '.webp', '.avif', '.heif', '.heic', '.hif',
      // RAW formats
      '.dng', '.cr2', '.cr3', '.nef', '.arw', '.orf', '.rw2', '.raf', '.pef', '.srw'
    ]);
    
    this.stats = {
      totalFiles: 0,
      imageFiles: 0,
      skippedFiles: 0,
      directories: 0
    };
  }

  /**
   * Recursively scan directory for image files
   * @param {string} directoryPath - Path to scan
   * @returns {Promise<string[]>} Array of image file paths
   */
  async scanDirectory(directoryPath) {
    this.logger.info(`Starting directory scan: ${directoryPath}`);
    this.resetStats();
    
    try {
      const imageFiles = await this.scanRecursive(directoryPath);
      
      this.logger.info('Directory scan completed', {
        totalFiles: this.stats.totalFiles,
        imageFiles: this.stats.imageFiles,
        skippedFiles: this.stats.skippedFiles,
        directories: this.stats.directories
      });
      
      return imageFiles;
      
    } catch (error) {
      this.logger.error(`Directory scan failed: ${error.message}`);
      throw new Error(`Failed to scan directory: ${error.message}`);
    }
  }

  /**
   * Recursive directory scanning implementation
   * @param {string} currentPath - Current directory path
   * @returns {Promise<string[]>} Array of image file paths
   */
  async scanRecursive(currentPath) {
    const imageFiles = [];
    
    try {
      const entries = await readdir(currentPath);
      
      for (const entry of entries) {
        const fullPath = join(currentPath, entry);
        
        try {
          const stats = await stat(fullPath);
          
          if (stats.isDirectory()) {
            this.stats.directories++;
            
            // Skip hidden directories and common non-image directories
            if (this.shouldSkipDirectory(entry)) {
              this.logger.debug(`Skipping directory: ${entry}`);
              continue;
            }
            
            // Recursively scan subdirectory
            const subDirectoryFiles = await this.scanRecursive(fullPath);
            imageFiles.push(...subDirectoryFiles);
            
          } else if (stats.isFile()) {
            this.stats.totalFiles++;
            
            if (this.isImageFile(entry)) {
              this.stats.imageFiles++;
              imageFiles.push(fullPath);
              this.logger.debug(`Found image: ${fullPath}`);
            } else {
              this.stats.skippedFiles++;
            }
          }
          
        } catch (entryError) {
          this.logger.warn(`Cannot access ${fullPath}: ${entryError.message}`);
          this.stats.skippedFiles++;
        }
      }
      
    } catch (error) {
      this.logger.error(`Cannot read directory ${currentPath}: ${error.message}`);
      throw error;
    }
    
    return imageFiles;
  }

  /**
   * Check if file is a supported image format
   * @param {string} filename - File name to check
   * @returns {boolean} True if supported image format
   */
  isImageFile(filename) {
    const extension = extname(filename).toLowerCase();
    return this.supportedFormats.has(extension);
  }

  /**
   * Check if directory should be skipped
   * @param {string} directoryName - Directory name to check
   * @returns {boolean} True if directory should be skipped
   */
  shouldSkipDirectory(directoryName) {
    const skipPatterns = [
      // Hidden directories
      /^\./,
      // System directories
      /^__pycache__$/,
      /^node_modules$/,
      /^\.git$/,
      /^\.vscode$/,
      /^\.idea$/,
      // Thumbnail directories
      /^thumbs$/i,
      /^thumbnails$/i,
      /^\.thumbnails$/i,
      // Temporary directories
      /^temp$/i,
      /^tmp$/i,
      /^cache$/i
    ];
    
    return skipPatterns.some(pattern => pattern.test(directoryName));
  }

  /**
   * Get file format statistics
   * @param {string[]} imageFiles - Array of image file paths
   * @returns {Object} Format statistics
   */
  getFormatStatistics(imageFiles) {
    const formatCounts = {};
    
    imageFiles.forEach(filePath => {
      const extension = extname(filePath).toLowerCase();
      formatCounts[extension] = (formatCounts[extension] || 0) + 1;
    });
    
    return {
      totalFiles: imageFiles.length,
      formats: formatCounts,
      uniqueFormats: Object.keys(formatCounts).length
    };
  }

  /**
   * Filter files by format
   * @param {string[]} imageFiles - Array of image file paths
   * @param {string[]} formats - Array of formats to include (e.g., ['.jpg', '.cr3'])
   * @returns {string[]} Filtered array of image file paths
   */
  filterByFormat(imageFiles, formats) {
    const formatSet = new Set(formats.map(f => f.toLowerCase()));
    
    return imageFiles.filter(filePath => {
      const extension = extname(filePath).toLowerCase();
      return formatSet.has(extension);
    });
  }

  /**
   * Get directory structure summary
   * @param {string[]} imageFiles - Array of image file paths
   * @returns {Object} Directory structure summary
   */
  getDirectoryStructure(imageFiles) {
    const directories = new Set();
    
    imageFiles.forEach(filePath => {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      directories.add(dir);
    });
    
    return {
      totalDirectories: directories.size,
      directories: Array.from(directories).sort(),
      averageFilesPerDirectory: Math.round(imageFiles.length / directories.size)
    };
  }

  /**
   * Reset statistics counters
   */
  resetStats() {
    this.stats = {
      totalFiles: 0,
      imageFiles: 0,
      skippedFiles: 0,
      directories: 0
    };
  }

  /**
   * Get current scan statistics
   * @returns {Object} Current statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Validate directory path exists and is accessible
   * @param {string} directoryPath - Path to validate
   * @returns {Promise<boolean>} True if valid and accessible
   */
  async validateDirectory(directoryPath) {
    try {
      const stats = await stat(directoryPath);
      
      if (!stats.isDirectory()) {
        this.logger.error(`Path is not a directory: ${directoryPath}`);
        return false;
      }
      
      // Try to read the directory to check permissions
      await readdir(directoryPath);
      
      return true;
      
    } catch (error) {
      this.logger.error(`Directory validation failed: ${error.message}`);
      return false;
    }
  }
}

export default FileDiscoveryService;