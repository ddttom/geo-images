/**
 * Structure Analyzer
 * 
 * Analyzes JSON structure to detect timeline objects and validate
 * against expected Google Timeline formats.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Structure analyzer for Timeline diagnostic utility
 */
class StructureAnalyzer {
  constructor(logger) {
    this.logger = logger;
    this.expectedSchemas = null;
  }

  /**
   * Load expected timeline schemas
   */
  async loadSchemas() {
    if (this.expectedSchemas) return this.expectedSchemas;

    try {
      // Define expected schemas inline since we don't have external files
      this.expectedSchemas = {
        standard: {
          name: 'Standard Google Timeline Format',
          version: '2024',
          structure: {
            timelineObjects: {
              type: 'array',
              required: true,
              items: {
                oneOf: [
                  { $ref: '#/definitions/activitySegment' },
                  { $ref: '#/definitions/placeVisit' }
                ]
              }
            }
          }
        },
        timelineEdits: {
          name: 'Timeline Edits Format',
          version: '2024',
          structure: {
            timelineEdits: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                properties: {
                  placeAggregates: { type: 'object' },
                  rawSignal: { type: 'object' }
                }
              }
            }
          }
        },
        semantic: {
          name: 'Semantic Timeline Format',
          version: '2023',
          structure: {
            semanticSegments: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                properties: {
                  timelineObjects: {
                    type: 'array',
                    items: {
                      oneOf: [
                        { $ref: '#/definitions/activitySegment' },
                        { $ref: '#/definitions/placeVisit' }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      };

      return this.expectedSchemas;
    } catch (error) {
      this.logger.warn('Failed to load schemas:', error.message);
      return {};
    }
  }

  /**
   * Analyze JSON structure
   */
  async analyzeStructure(jsonData) {
    this.logger.time('Structure Analysis');

    try {
      await this.loadSchemas();

      const analysis = {
        isValidJSON: jsonData !== null && typeof jsonData === 'object',
        rootType: this.getDataType(jsonData),
        hasTimelineObjects: false,
        timelineObjectsPath: null,
        timelineObjectsCount: 0,
        detectedFormat: null,
        schemaMatches: [],
        alternativePaths: [],
        structureMap: {},
        issues: [],
        recommendations: []
      };

      if (!analysis.isValidJSON) {
        analysis.issues.push('Invalid JSON structure - not an object');
        this.logger.timeEnd('Structure Analysis');
        return analysis;
      }

      // Generate structure map
      analysis.structureMap = this.generateStructureMap(jsonData);

      // Check for timeline objects at root level
      const rootCheck = this.checkTimelineObjects(jsonData, '');
      if (rootCheck.found) {
        analysis.hasTimelineObjects = true;
        analysis.timelineObjectsPath = rootCheck.path;
        analysis.timelineObjectsCount = rootCheck.count;
      }

      // Search for timeline objects at deeper levels
      const deepSearch = this.searchTimelineObjects(jsonData);
      if (deepSearch.length > 0) {
        analysis.alternativePaths = deepSearch;
        
        if (!analysis.hasTimelineObjects) {
          // Use the first found path as primary
          const primary = deepSearch[0];
          analysis.hasTimelineObjects = true;
          analysis.timelineObjectsPath = primary.path;
          analysis.timelineObjectsCount = primary.count;
        }
      }

      // Match against known schemas
      analysis.schemaMatches = await this.matchSchemas(jsonData);
      analysis.detectedFormat = this.detectFormat(analysis, jsonData);

      // Generate issues and recommendations
      this.generateIssuesAndRecommendations(analysis);

      this.logger.timeEnd('Structure Analysis');
      this.logger.debug('Structure analysis completed:', {
        hasTimelineObjects: analysis.hasTimelineObjects,
        timelineObjectsCount: analysis.timelineObjectsCount,
        detectedFormat: analysis.detectedFormat
      });

      return analysis;

    } catch (error) {
      this.logger.error('Structure analysis failed:', error.message);
      throw new Error(`Structure analysis failed: ${error.message}`);
    }
  }

  /**
   * Get data type of value
   */
  getDataType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Generate structure map of JSON data
   */
  generateStructureMap(data, path = '', depth = 0, maxDepth = 5) {
    const map = {};

    if (depth > maxDepth) {
      map[path] = { type: 'truncated', reason: 'max_depth_exceeded' };
      return map;
    }

    const dataType = this.getDataType(data);
    
    if (dataType === 'object') {
      const keys = Object.keys(data);
      map[path || 'root'] = {
        type: 'object',
        keys: keys,
        keyCount: keys.length,
        depth
      };

      // Analyze each property
      keys.forEach(key => {
        const newPath = path ? `${path}.${key}` : key;
        const childMap = this.generateStructureMap(data[key], newPath, depth + 1, maxDepth);
        Object.assign(map, childMap);
      });

    } else if (dataType === 'array') {
      map[path || 'root'] = {
        type: 'array',
        length: data.length,
        depth
      };

      // Analyze array elements (sample first few)
      const sampleSize = Math.min(data.length, 3);
      for (let i = 0; i < sampleSize; i++) {
        const newPath = `${path}[${i}]`;
        const childMap = this.generateStructureMap(data[i], newPath, depth + 1, maxDepth);
        Object.assign(map, childMap);
      }

      if (data.length > sampleSize) {
        map[`${path}[...]`] = {
          type: 'truncated',
          reason: 'array_sampling',
          totalLength: data.length,
          sampledLength: sampleSize
        };
      }

    } else {
      map[path || 'root'] = {
        type: dataType,
        value: dataType === 'string' ? data.substring(0, 100) : data,
        depth
      };
    }

    return map;
  }

  /**
   * Check for timeline objects at specific location
   */
  checkTimelineObjects(data, path) {
    if (!data || typeof data !== 'object') {
      return { found: false, path: null, count: 0 };
    }

    // Check for standard timelineObjects array
    if (data.timelineObjects && Array.isArray(data.timelineObjects)) {
      const count = this.countValidTimelineObjects(data.timelineObjects);
      return {
        found: count > 0,
        path: path ? `${path}.timelineObjects` : 'timelineObjects',
        count
      };
    }

    // Check for Timeline Edits format
    if (data.timelineEdits && Array.isArray(data.timelineEdits)) {
      const count = this.countTimelineEditsObjects(data.timelineEdits);
      return {
        found: count > 0,
        path: path ? `${path}.timelineEdits` : 'timelineEdits',
        count
      };
    }

    return { found: false, path: null, count: 0 };
  }

  /**
   * Search for timeline objects at any depth
   */
  searchTimelineObjects(data, currentPath = '', maxDepth = 5, currentDepth = 0) {
    const results = [];

    if (currentDepth > maxDepth || !data || typeof data !== 'object') {
      return results;
    }

    // Check current level
    const check = this.checkTimelineObjects(data, currentPath);
    if (check.found) {
      results.push(check);
    }

    // Search deeper levels
    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        const newPath = `${currentPath}[${index}]`;
        const deepResults = this.searchTimelineObjects(item, newPath, maxDepth, currentDepth + 1);
        results.push(...deepResults);
      });
    } else {
      Object.entries(data).forEach(([key, value]) => {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        const deepResults = this.searchTimelineObjects(value, newPath, maxDepth, currentDepth + 1);
        results.push(...deepResults);
      });
    }

    return results;
  }

  /**
   * Count valid timeline objects in array
   */
  countValidTimelineObjects(timelineObjects) {
    if (!Array.isArray(timelineObjects)) return 0;

    return timelineObjects.filter(obj => {
      return obj && typeof obj === 'object' && (
        obj.activitySegment || obj.placeVisit
      );
    }).length;
  }

  /**
   * Count timeline edits objects that contain location data
   */
  countTimelineEditsObjects(timelineEdits) {
    if (!Array.isArray(timelineEdits)) return 0;

    let count = 0;
    timelineEdits.forEach(edit => {
      if (edit && typeof edit === 'object') {
        // Count place aggregates
        if (edit.placeAggregates && edit.placeAggregates.placeAggregateInfo) {
          count += Array.isArray(edit.placeAggregates.placeAggregateInfo) ? 
                   edit.placeAggregates.placeAggregateInfo.length : 0;
        }
        
        // Count raw signals with location data
        if (edit.rawSignal && edit.rawSignal.signal) {
          if (edit.rawSignal.signal.locationRecord || 
              edit.rawSignal.signal.activityRecord) {
            count++;
          }
        }
      }
    });

    return count;
  }

  /**
   * Match data against known schemas
   */
  async matchSchemas(data) {
    const matches = [];

    for (const [schemaName, schema] of Object.entries(this.expectedSchemas)) {
      const match = this.matchSchema(data, schema);
      if (match.score > 0) {
        matches.push({
          schema: schemaName,
          name: schema.name,
          version: schema.version,
          score: match.score,
          matches: match.matches,
          issues: match.issues
        });
      }
    }

    // Sort by match score
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Match data against specific schema
   */
  matchSchema(data, schema) {
    const result = {
      score: 0,
      matches: [],
      issues: []
    };

    if (!schema.structure) return result;

    // Check each required structure element
    Object.entries(schema.structure).forEach(([key, expectedStructure]) => {
      if (data.hasOwnProperty(key)) {
        result.score += 10;
        result.matches.push(`Found required key: ${key}`);

        // Check type match
        const actualType = this.getDataType(data[key]);
        if (actualType === expectedStructure.type) {
          result.score += 5;
          result.matches.push(`Type match for ${key}: ${actualType}`);
        } else {
          result.issues.push(`Type mismatch for ${key}: expected ${expectedStructure.type}, got ${actualType}`);
        }

        // Check array items if applicable
        if (expectedStructure.type === 'array' && Array.isArray(data[key])) {
          const itemCount = data[key].length;
          result.score += Math.min(itemCount, 5); // Bonus for having items
          result.matches.push(`Array ${key} has ${itemCount} items`);
        }
      } else if (expectedStructure.required) {
        result.issues.push(`Missing required key: ${key}`);
        result.score -= 5;
      }
    });

    return result;
  }

  /**
   * Detect format based on analysis
   */
  detectFormat(analysis, data) {
    if (analysis.schemaMatches.length > 0) {
      return analysis.schemaMatches[0].schema;
    }

    // Fallback detection based on structure
    if (data && typeof data === 'object') {
      if (data.timelineEdits) {
        return 'timelineEdits';
      } else if (data.timelineObjects) {
        return 'standard';
      } else if (data.semanticSegments) {
        return 'semantic';
      }
    }

    return 'unknown';
  }

  /**
   * Generate issues and recommendations
   */
  generateIssuesAndRecommendations(analysis) {
    // Check for missing timeline objects
    if (!analysis.hasTimelineObjects) {
      analysis.issues.push('No timeline objects found in expected locations');
      analysis.recommendations.push({
        type: 'missing_timeline_objects',
        severity: 'high',
        message: 'Timeline objects not found at root level',
        suggestion: 'Check alternative paths or verify file format'
      });
    }

    // Check for alternative paths
    if (analysis.alternativePaths.length > 0 && analysis.timelineObjectsPath !== 'timelineObjects') {
      analysis.recommendations.push({
        type: 'alternative_path',
        severity: 'medium',
        message: `Timeline objects found at: ${analysis.timelineObjectsPath}`,
        suggestion: `Update parser to use path: ${analysis.timelineObjectsPath}`,
        code: this.generateCodeSuggestion(analysis.timelineObjectsPath)
      });
    }

    // Check for low timeline object count
    if (analysis.hasTimelineObjects && analysis.timelineObjectsCount === 0) {
      analysis.issues.push('Timeline objects array is empty');
      analysis.recommendations.push({
        type: 'empty_timeline_objects',
        severity: 'high',
        message: 'Timeline objects array exists but is empty',
        suggestion: 'Verify data export settings or check for data corruption'
      });
    }

    // Check for unknown format
    if (analysis.detectedFormat === 'unknown') {
      analysis.issues.push('Unknown timeline format detected');
      analysis.recommendations.push({
        type: 'unknown_format',
        severity: 'medium',
        message: 'Timeline format does not match known schemas',
        suggestion: 'Manual inspection required to understand structure'
      });
    }
  }

  /**
   * Generate code suggestion for alternative path
   */
  generateCodeSuggestion(path) {
    const pathParts = path.split('.');
    let code = 'timelineData';
    
    pathParts.forEach(part => {
      if (part.includes('[') && part.includes(']')) {
        // Array access
        const arrayPart = part.split('[')[0];
        const indexPart = part.split('[')[1].split(']')[0];
        code += `.${arrayPart}`;
        if (!isNaN(indexPart)) {
          code += `[${indexPart}]`;
        } else {
          code += `?.forEach(item => item.${indexPart})`;
        }
      } else {
        code += `.${part}`;
      }
    });
    
    return `
// Access timeline objects at alternative path
const timelineObjects = ${code} || [];
if (timelineObjects.length > 0) {
  this.logger.info(\`Found \${timelineObjects.length} timeline objects at: ${path}\`);
  // Process timeline objects
  for (const timelineObject of timelineObjects) {
    // ... existing processing logic
  }
}`;
  }
}

export default StructureAnalyzer;