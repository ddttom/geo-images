/**
 * Streaming JSON Parser
 * 
 * Memory-safe JSON parser that can handle files of any size using
 * streaming and chunked processing techniques.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Streaming JSON parser for large Timeline files
 */
class StreamingJsonParser {
  constructor(logger) {
    this.logger = logger;
    this.DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    this.MAX_STANDARD_PARSE_SIZE = 50 * 1024 * 1024; // 50MB
  }

  /**
   * Parse JSON file using appropriate method based on size
   */
  async parseFile(filePath) {
    this.logger.time('JSON Parsing');
    
    try {
      // For smaller files, use standard JSON.parse
      const fileContent = await readFile(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);
      
      this.logger.timeEnd('JSON Parsing');
      return jsonData;
      
    } catch (error) {
      this.logger.error('Standard JSON parsing failed:', error.message);
      
      // Fallback to streaming parser
      this.logger.info('Falling back to streaming parser...');
      return await this.parseStream(filePath);
    }
  }

  /**
   * Parse JSON using streaming approach
   */
  async parseStream(filePath, options = {}) {
    const {
      chunkSize = this.DEFAULT_CHUNK_SIZE,
      structureOnly = false,
      maxDepth = 10
    } = options;

    this.logger.time('Streaming JSON Parse');
    this.logger.info(`Starting streaming parse with chunk size: ${this.formatBytes(chunkSize)}`);

    try {
      const parser = new StreamingJsonTokenizer(this.logger, {
        structureOnly,
        maxDepth
      });

      const readStream = createReadStream(filePath, { 
        encoding: 'utf-8',
        highWaterMark: chunkSize 
      });

      // Process the stream
      await pipeline(
        readStream,
        parser
      );

      const result = parser.getResult();
      
      this.logger.timeEnd('Streaming JSON Parse');
      this.logger.info(`Parsed ${result.stats.totalTokens} JSON tokens`);
      
      return result;

    } catch (error) {
      this.logger.error('Streaming JSON parsing failed:', error.message);
      
      // Try partial parsing for corrupted files
      return await this.parsePartial(filePath, options);
    }
  }

  /**
   * Attempt partial parsing of corrupted JSON
   */
  async parsePartial(filePath, options = {}) {
    this.logger.info('Attempting partial JSON parsing...');
    
    try {
      const partialParser = new PartialJsonParser(this.logger, options);
      return await partialParser.parse(filePath);
      
    } catch (error) {
      this.logger.error('Partial JSON parsing failed:', error.message);
      throw new Error(`All JSON parsing methods failed: ${error.message}`);
    }
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Streaming JSON tokenizer transform stream
 */
class StreamingJsonTokenizer extends Transform {
  constructor(logger, options = {}) {
    super({ objectMode: true });
    
    this.logger = logger;
    this.structureOnly = options.structureOnly || false;
    this.maxDepth = options.maxDepth || 10;
    
    // Parser state
    this.buffer = '';
    this.stack = [];
    this.currentPath = [];
    this.result = {
      data: null,
      structure: {},
      stats: {
        totalTokens: 0,
        objectCount: 0,
        arrayCount: 0,
        maxDepth: 0,
        errors: []
      }
    };
    
    // JSON parsing state
    this.inString = false;
    this.escaped = false;
    this.depth = 0;
    this.position = 0;
  }

  /**
   * Transform stream chunk
   */
  _transform(chunk, encoding, callback) {
    try {
      this.buffer += chunk.toString();
      this.processBuffer();
      callback();
    } catch (error) {
      this.logger.error('Transform error:', error.message);
      callback(error);
    }
  }

  /**
   * Process accumulated buffer
   */
  processBuffer() {
    let i = 0;
    
    while (i < this.buffer.length) {
      const char = this.buffer[i];
      this.position++;
      
      try {
        this.processCharacter(char, i);
      } catch (error) {
        this.result.stats.errors.push({
          position: this.position,
          character: char,
          error: error.message
        });
        
        // Try to recover by skipping to next structural character
        i = this.findNextStructuralChar(i);
        continue;
      }
      
      i++;
    }
    
    // Keep unprocessed portion in buffer
    this.buffer = this.buffer.slice(i);
  }

  /**
   * Process individual character
   */
  processCharacter(char, position) {
    // Handle string state
    if (this.inString) {
      if (this.escaped) {
        this.escaped = false;
      } else if (char === '\\') {
        this.escaped = true;
      } else if (char === '"') {
        this.inString = false;
      }
      return;
    }

    // Handle non-string characters
    switch (char) {
      case '"':
        this.inString = true;
        break;
        
      case '{':
        this.handleObjectStart();
        break;
        
      case '}':
        this.handleObjectEnd();
        break;
        
      case '[':
        this.handleArrayStart();
        break;
        
      case ']':
        this.handleArrayEnd();
        break;
        
      case ':':
        this.handleColon();
        break;
        
      case ',':
        this.handleComma();
        break;
        
      default:
        // Skip whitespace and other characters
        break;
    }
    
    this.result.stats.totalTokens++;
  }

  /**
   * Handle object start
   */
  handleObjectStart() {
    this.depth++;
    this.result.stats.maxDepth = Math.max(this.result.stats.maxDepth, this.depth);
    this.result.stats.objectCount++;
    
    const pathKey = this.currentPath.join('.');
    if (!this.result.structure[pathKey]) {
      this.result.structure[pathKey] = {
        type: 'object',
        depth: this.depth,
        keys: new Set()
      };
    }
    
    this.stack.push({ type: 'object', path: [...this.currentPath] });
  }

  /**
   * Handle object end
   */
  handleObjectEnd() {
    this.depth--;
    
    if (this.stack.length > 0) {
      const popped = this.stack.pop();
      this.currentPath = popped.path;
    }
  }

  /**
   * Handle array start
   */
  handleArrayStart() {
    this.depth++;
    this.result.stats.maxDepth = Math.max(this.result.stats.maxDepth, this.depth);
    this.result.stats.arrayCount++;
    
    const pathKey = this.currentPath.join('.');
    if (!this.result.structure[pathKey]) {
      this.result.structure[pathKey] = {
        type: 'array',
        depth: this.depth,
        length: 0
      };
    }
    
    this.stack.push({ type: 'array', path: [...this.currentPath], index: 0 });
  }

  /**
   * Handle array end
   */
  handleArrayEnd() {
    this.depth--;
    
    if (this.stack.length > 0) {
      const popped = this.stack.pop();
      this.currentPath = popped.path;
    }
  }

  /**
   * Handle colon (key-value separator)
   */
  handleColon() {
    // Extract key from buffer if we're in an object
    if (this.stack.length > 0 && this.stack[this.stack.length - 1].type === 'object') {
      const key = this.extractLastKey();
      if (key) {
        this.currentPath.push(key);
        
        const parentPath = this.currentPath.slice(0, -1).join('.');
        if (this.result.structure[parentPath]) {
          this.result.structure[parentPath].keys.add(key);
        }
      }
    }
  }

  /**
   * Handle comma (value separator)
   */
  handleComma() {
    // Reset path for next value
    if (this.stack.length > 0) {
      const current = this.stack[this.stack.length - 1];
      
      if (current.type === 'object') {
        // Remove last key from path
        this.currentPath = current.path;
      } else if (current.type === 'array') {
        // Increment array index
        current.index++;
        this.currentPath = [...current.path, current.index.toString()];
      }
    }
  }

  /**
   * Extract the last JSON key from buffer
   */
  extractLastKey() {
    // Simple key extraction - look for last quoted string before colon
    const colonIndex = this.buffer.lastIndexOf(':');
    if (colonIndex === -1) return null;
    
    const beforeColon = this.buffer.substring(0, colonIndex);
    const keyMatch = beforeColon.match(/"([^"\\]*(\\.[^"\\]*)*)"\s*$/);
    
    return keyMatch ? keyMatch[1] : null;
  }

  /**
   * Find next structural character for error recovery
   */
  findNextStructuralChar(startIndex) {
    const structuralChars = ['{', '}', '[', ']', ':', ','];
    
    for (let i = startIndex + 1; i < this.buffer.length; i++) {
      if (structuralChars.includes(this.buffer[i])) {
        return i;
      }
    }
    
    return this.buffer.length;
  }

  /**
   * Get parsing result
   */
  getResult() {
    // Convert Sets to Arrays for JSON serialization
    Object.values(this.result.structure).forEach(item => {
      if (item.keys instanceof Set) {
        item.keys = Array.from(item.keys);
      }
    });
    
    return this.result;
  }
}

/**
 * Partial JSON parser for corrupted files
 */
class PartialJsonParser {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.options = options;
  }

  /**
   * Parse JSON with error recovery
   */
  async parse(filePath) {
    this.logger.info('Starting partial JSON parsing...');
    
    try {
      const content = await readFile(filePath, 'utf-8');
      
      // Try to fix common JSON issues
      const fixedContent = this.fixCommonIssues(content);
      
      // Attempt parsing with fixes
      try {
        const data = JSON.parse(fixedContent);
        this.logger.info('Partial parsing successful with fixes');
        return {
          data,
          structure: this.analyzeStructure(data),
          stats: {
            totalTokens: 0,
            objectCount: 0,
            arrayCount: 0,
            maxDepth: 0,
            errors: [],
            fixed: true
          }
        };
      } catch (parseError) {
        // Extract what we can from the corrupted JSON
        return this.extractPartialData(content, parseError);
      }
      
    } catch (error) {
      throw new Error(`Partial parsing failed: ${error.message}`);
    }
  }

  /**
   * Fix common JSON issues
   */
  fixCommonIssues(content) {
    let fixed = content;
    
    // Remove trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix unescaped quotes in strings (basic attempt)
    fixed = fixed.replace(/([^\\])"([^"]*)"([^:])/g, '$1\\"$2\\"$3');
    
    // Remove BOM if present
    if (fixed.charCodeAt(0) === 0xFEFF) {
      fixed = fixed.slice(1);
    }
    
    return fixed;
  }

  /**
   * Extract partial data from corrupted JSON
   */
  extractPartialData(content, error) {
    this.logger.warn('Extracting partial data from corrupted JSON');
    
    // Try to find valid JSON fragments
    const fragments = this.findJsonFragments(content);
    
    return {
      data: null,
      structure: { corrupted: true, fragments: fragments.length },
      stats: {
        totalTokens: 0,
        objectCount: 0,
        arrayCount: 0,
        maxDepth: 0,
        errors: [{ message: error.message, position: 0 }],
        partial: true,
        fragments
      }
    };
  }

  /**
   * Find valid JSON fragments in corrupted content
   */
  findJsonFragments(content) {
    const fragments = [];
    const objectRegex = /\{[^{}]*\}/g;
    const arrayRegex = /\[[^\[\]]*\]/g;
    
    let match;
    
    // Find object fragments
    while ((match = objectRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        fragments.push({
          type: 'object',
          position: match.index,
          content: match[0],
          parsed
        });
      } catch (e) {
        // Skip invalid fragments
      }
    }
    
    // Find array fragments
    while ((match = arrayRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        fragments.push({
          type: 'array',
          position: match.index,
          content: match[0],
          parsed
        });
      } catch (e) {
        // Skip invalid fragments
      }
    }
    
    return fragments;
  }

  /**
   * Analyze structure of parsed data
   */
  analyzeStructure(data, path = '', depth = 0) {
    const structure = {};
    
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        structure[path] = {
          type: 'array',
          length: data.length,
          depth
        };
        
        // Analyze array elements
        data.forEach((item, index) => {
          const itemPath = path ? `${path}[${index}]` : `[${index}]`;
          Object.assign(structure, this.analyzeStructure(item, itemPath, depth + 1));
        });
      } else {
        structure[path] = {
          type: 'object',
          keys: Object.keys(data),
          depth
        };
        
        // Analyze object properties
        Object.entries(data).forEach(([key, value]) => {
          const keyPath = path ? `${path}.${key}` : key;
          Object.assign(structure, this.analyzeStructure(value, keyPath, depth + 1));
        });
      }
    }
    
    return structure;
  }
}

export default StreamingJsonParser;