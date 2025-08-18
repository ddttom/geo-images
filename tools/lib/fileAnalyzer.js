/**
 * File Analyzer
 * 
 * Analyzes file system properties, encoding, and characteristics
 * of Timeline Edits.json files for diagnostic purposes.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { readFile, stat, access, constants } from 'fs/promises';
import { createReadStream } from 'fs';
import { totalmem, freemem } from 'os';

/**
 * File analyzer for Timeline diagnostic utility
 */
class FileAnalyzer {
  constructor(logger) {
    this.logger = logger;
    
    // Memory thresholds for processing recommendations
    this.SMALL_FILE_THRESHOLD = 10 * 1024 * 1024;  // 10MB
    this.LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
    this.MEMORY_MULTIPLIER = 3; // JSON parsing typically uses 3x file size in memory
  }

  /**
   * Analyze file characteristics
   */
  async analyzeFile(filePath) {
    this.logger.time('File Analysis');
    
    try {
      // Get file statistics
      const fileStats = await stat(filePath);
      
      // Check file permissions
      const permissions = await this.checkPermissions(filePath);
      
      // Detect encoding and BOM
      const encodingInfo = await this.detectEncoding(filePath);
      
      // Estimate memory requirements
      const memoryEstimate = this.estimateMemoryUsage(fileStats.size);
      
      // Determine processing recommendations
      const processingRecommendations = this.getProcessingRecommendations(fileStats.size);
      
      const analysis = {
        size: fileStats.size,
        sizeFormatted: this.formatBytes(fileStats.size),
        created: fileStats.birthtime,
        modified: fileStats.mtime,
        permissions,
        encoding: encodingInfo.encoding,
        hasBOM: encodingInfo.hasBOM,
        bomType: encodingInfo.bomType,
        memoryRequirement: memoryEstimate.estimated,
        memoryRequirementFormatted: this.formatBytes(memoryEstimate.estimated),
        recommendStreaming: processingRecommendations.useStreaming,
        processingMode: processingRecommendations.mode,
        riskLevel: processingRecommendations.riskLevel,
        warnings: processingRecommendations.warnings
      };
      
      this.logger.timeEnd('File Analysis');
      this.logger.debug('File analysis completed:', analysis);
      
      return analysis;
      
    } catch (error) {
      this.logger.error('File analysis failed:', error.message);
      throw new Error(`File analysis failed: ${error.message}`);
    }
  }

  /**
   * Check file permissions
   */
  async checkPermissions(filePath) {
    const permissions = {
      readable: false,
      writable: false,
      executable: false
    };

    try {
      await access(filePath, constants.R_OK);
      permissions.readable = true;
    } catch (error) {
      this.logger.warn('File is not readable:', error.message);
    }

    try {
      await access(filePath, constants.W_OK);
      permissions.writable = true;
    } catch (error) {
      // Write permission not required for analysis
    }

    try {
      await access(filePath, constants.X_OK);
      permissions.executable = true;
    } catch (error) {
      // Execute permission not required for analysis
    }

    return permissions;
  }

  /**
   * Detect file encoding and BOM
   */
  async detectEncoding(filePath) {
    const SAMPLE_SIZE = 1024; // Read first 1KB for encoding detection
    
    try {
      const buffer = await this.readFileChunk(filePath, 0, SAMPLE_SIZE);
      
      // Check for BOM (Byte Order Mark)
      const bomInfo = this.detectBOM(buffer);
      
      // Detect encoding
      const encoding = this.detectTextEncoding(buffer, bomInfo);
      
      return {
        encoding,
        hasBOM: bomInfo.hasBOM,
        bomType: bomInfo.type,
        confidence: this.calculateEncodingConfidence(buffer, encoding)
      };
      
    } catch (error) {
      this.logger.warn('Encoding detection failed:', error.message);
      return {
        encoding: 'utf-8',
        hasBOM: false,
        bomType: null,
        confidence: 0
      };
    }
  }

  /**
   * Read a chunk of file data
   */
  async readFileChunk(filePath, start, length) {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, { start, end: start + length - 1 });
      const chunks = [];
      
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Detect Byte Order Mark (BOM)
   */
  detectBOM(buffer) {
    if (buffer.length < 2) {
      return { hasBOM: false, type: null, length: 0 };
    }

    // UTF-8 BOM: EF BB BF
    if (buffer.length >= 3 && 
        buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      return { hasBOM: true, type: 'UTF-8', length: 3 };
    }

    // UTF-16 BE BOM: FE FF
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
      return { hasBOM: true, type: 'UTF-16BE', length: 2 };
    }

    // UTF-16 LE BOM: FF FE
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
      return { hasBOM: true, type: 'UTF-16LE', length: 2 };
    }

    // UTF-32 BE BOM: 00 00 FE FF
    if (buffer.length >= 4 &&
        buffer[0] === 0x00 && buffer[1] === 0x00 && 
        buffer[2] === 0xFE && buffer[3] === 0xFF) {
      return { hasBOM: true, type: 'UTF-32BE', length: 4 };
    }

    // UTF-32 LE BOM: FF FE 00 00
    if (buffer.length >= 4 &&
        buffer[0] === 0xFF && buffer[1] === 0xFE && 
        buffer[2] === 0x00 && buffer[3] === 0x00) {
      return { hasBOM: true, type: 'UTF-32LE', length: 4 };
    }

    return { hasBOM: false, type: null, length: 0 };
  }

  /**
   * Detect text encoding
   */
  detectTextEncoding(buffer, bomInfo) {
    // If BOM is present, use BOM-indicated encoding
    if (bomInfo.hasBOM) {
      switch (bomInfo.type) {
        case 'UTF-8': return 'utf-8';
        case 'UTF-16BE': return 'utf-16be';
        case 'UTF-16LE': return 'utf-16le';
        case 'UTF-32BE': return 'utf-32be';
        case 'UTF-32LE': return 'utf-32le';
      }
    }

    // Skip BOM bytes for analysis
    const analysisBuffer = bomInfo.hasBOM ? 
      buffer.slice(bomInfo.length) : buffer;

    // Check for null bytes (indicates UTF-16 or UTF-32)
    const nullBytes = this.countNullBytes(analysisBuffer);
    if (nullBytes > analysisBuffer.length * 0.1) {
      return 'utf-16le'; // Most common UTF-16 variant
    }

    // Check for valid UTF-8 sequences
    if (this.isValidUTF8(analysisBuffer)) {
      return 'utf-8';
    }

    // Check for ASCII (subset of UTF-8)
    if (this.isASCII(analysisBuffer)) {
      return 'ascii';
    }

    // Default to UTF-8 if uncertain
    return 'utf-8';
  }

  /**
   * Count null bytes in buffer
   */
  countNullBytes(buffer) {
    let count = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0) count++;
    }
    return count;
  }

  /**
   * Check if buffer contains valid UTF-8
   */
  isValidUTF8(buffer) {
    try {
      const text = buffer.toString('utf-8');
      // Check for replacement characters which indicate invalid UTF-8
      return !text.includes('\uFFFD');
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if buffer contains only ASCII characters
   */
  isASCII(buffer) {
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] > 127) return false;
    }
    return true;
  }

  /**
   * Calculate encoding detection confidence
   */
  calculateEncodingConfidence(buffer, encoding) {
    try {
      const text = buffer.toString(encoding);
      
      // Check for common JSON characters
      const jsonChars = ['{', '}', '[', ']', '"', ':', ','];
      const jsonCharCount = jsonChars.reduce((count, char) => 
        count + (text.split(char).length - 1), 0);
      
      // Higher confidence if we see JSON structure
      const baseConfidence = jsonCharCount > 0 ? 0.8 : 0.5;
      
      // Reduce confidence if we see replacement characters
      const replacementChars = (text.match(/\uFFFD/g) || []).length;
      const penalty = Math.min(replacementChars * 0.1, 0.5);
      
      return Math.max(0, Math.min(1, baseConfidence - penalty));
      
    } catch (error) {
      return 0;
    }
  }

  /**
   * Estimate memory usage for JSON parsing
   */
  estimateMemoryUsage(fileSize) {
    // JSON parsing typically requires 3-5x the file size in memory
    // due to string interning and object creation overhead
    const baseEstimate = fileSize * this.MEMORY_MULTIPLIER;
    
    // Add overhead for Node.js and V8
    const v8Overhead = 50 * 1024 * 1024; // ~50MB base overhead
    
    const estimated = baseEstimate + v8Overhead;
    
    return {
      fileSize,
      multiplier: this.MEMORY_MULTIPLIER,
      baseEstimate,
      v8Overhead,
      estimated,
      availableMemory: this.getAvailableMemory()
    };
  }

  /**
   * Get available system memory
   */
  getAvailableMemory() {
    const usage = process.memoryUsage();
    const totalMemory = totalmem();
    const freeMemory = freemem();
    
    return {
      total: totalMemory,
      free: freeMemory,
      used: totalMemory - freeMemory,
      nodeUsed: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal
    };
  }

  /**
   * Get processing recommendations based on file size
   */
  getProcessingRecommendations(fileSize) {
    const warnings = [];
    let mode = 'standard';
    let riskLevel = 'low';
    let useStreaming = false;

    if (fileSize > this.LARGE_FILE_THRESHOLD) {
      mode = 'streaming';
      riskLevel = 'high';
      useStreaming = true;
      warnings.push('Large file detected - streaming mode recommended');
      warnings.push('Memory usage may be significant during processing');
    } else if (fileSize > this.SMALL_FILE_THRESHOLD) {
      mode = 'chunked';
      riskLevel = 'medium';
      warnings.push('Medium file size - consider chunked processing');
    }

    // Check available memory
    const memoryEstimate = this.estimateMemoryUsage(fileSize);
    const availableMemory = memoryEstimate.availableMemory.free;
    
    if (memoryEstimate.estimated > availableMemory * 0.8) {
      useStreaming = true;
      riskLevel = 'high';
      warnings.push('Insufficient memory for standard parsing - streaming required');
    }

    return {
      mode,
      riskLevel,
      useStreaming,
      warnings,
      memoryEstimate: memoryEstimate.estimated,
      availableMemory
    };
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default FileAnalyzer;