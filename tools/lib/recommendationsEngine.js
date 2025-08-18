/**
 * Recommendations Engine
 * 
 * Generates specific recommendations for fixing timeline parsing issues
 * and improving compatibility with the main application.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

/**
 * Recommendations engine for Timeline diagnostic utility
 */
class RecommendationsEngine {
  constructor(logger) {
    this.logger = logger;
    
    // Recommendation templates
    this.templates = {
      structure: {
        missing_timeline_objects: {
          severity: 'high',
          category: 'structure',
          title: 'Timeline Objects Not Found',
          description: 'The expected timelineObjects array was not found at the root level',
          impact: 'No timeline data will be processed by the main application'
        },
        alternative_path: {
          severity: 'medium',
          category: 'structure',
          title: 'Timeline Objects Found at Alternative Path',
          description: 'Timeline objects were found but not at the expected location',
          impact: 'Timeline data exists but cannot be accessed with current parser logic'
        },
        empty_timeline_objects: {
          severity: 'high',
          category: 'data',
          title: 'Empty Timeline Objects Array',
          description: 'Timeline objects array exists but contains no data',
          impact: 'No location data available for GPS coordinate interpolation'
        },
        unknown_format: {
          severity: 'medium',
          category: 'compatibility',
          title: 'Unknown Timeline Format',
          description: 'Timeline format does not match any known Google Timeline schemas',
          impact: 'Manual parser updates may be required for compatibility'
        }
      },
      parsing: {
        syntax_error: {
          severity: 'high',
          category: 'parsing',
          title: 'JSON Syntax Error',
          description: 'Invalid JSON syntax prevents parsing',
          impact: 'File cannot be processed until syntax errors are fixed'
        },
        truncated_file: {
          severity: 'high',
          category: 'file',
          title: 'Truncated File Detected',
          description: 'File appears to be incomplete or corrupted',
          impact: 'Partial data loss and parsing failures'
        },
        encoding_issue: {
          severity: 'medium',
          category: 'encoding',
          title: 'File Encoding Issue',
          description: 'File encoding may cause parsing problems',
          impact: 'Character corruption and parsing errors'
        },
        memory_constraint: {
          severity: 'medium',
          category: 'performance',
          title: 'Memory Constraint Detected',
          description: 'File size may exceed available memory for standard parsing',
          impact: 'Potential memory errors or slow performance'
        }
      },
      data_quality: {
        invalid_coordinates: {
          severity: 'medium',
          category: 'data_quality',
          title: 'Invalid Coordinates Detected',
          description: 'Some location coordinates are outside valid ranges',
          impact: 'GPS interpolation may fail for affected records'
        },
        missing_timestamps: {
          severity: 'medium',
          category: 'data_quality',
          title: 'Missing Timestamps',
          description: 'Some timeline objects lack timestamp information',
          impact: 'Temporal matching for GPS interpolation will be limited'
        },
        low_accuracy: {
          severity: 'low',
          category: 'data_quality',
          title: 'Low GPS Accuracy',
          description: 'Many location records have poor GPS accuracy',
          impact: 'Reduced precision in GPS coordinate interpolation'
        }
      }
    };
  }

  /**
   * Generate recommendations based on diagnostic analysis
   */
  async generateRecommendations(diagnosticData) {
    this.logger.time('Recommendations Generation');
    this.logger.info('Generating recommendations...');

    try {
      const recommendations = [];

      // Analyze file-level issues
      const fileRecommendations = this.analyzeFileIssues(diagnosticData.fileAnalysis);
      recommendations.push(...fileRecommendations);

      // Analyze structure issues
      const structureRecommendations = this.analyzeStructureIssues(diagnosticData.structureAnalysis);
      recommendations.push(...structureRecommendations);

      // Analyze content issues
      if (diagnosticData.contentAnalysis) {
        const contentRecommendations = this.analyzeContentIssues(diagnosticData.contentAnalysis);
        recommendations.push(...contentRecommendations);
      }

      // Generate integration recommendations
      const integrationRecommendations = this.generateIntegrationRecommendations(diagnosticData);
      recommendations.push(...integrationRecommendations);

      // Sort by severity and priority
      const sortedRecommendations = this.prioritizeRecommendations(recommendations);

      this.logger.timeEnd('Recommendations Generation');
      this.logger.info(`Generated ${sortedRecommendations.length} recommendations`);

      return sortedRecommendations;

    } catch (error) {
      this.logger.error('Recommendations generation failed:', error.message);
      throw new Error(`Recommendations generation failed: ${error.message}`);
    }
  }

  /**
   * Analyze file-level issues
   */
  analyzeFileIssues(fileAnalysis) {
    const recommendations = [];

    if (!fileAnalysis) return recommendations;

    // Memory constraint recommendations
    if (fileAnalysis.recommendStreaming) {
      recommendations.push(this.createRecommendation('memory_constraint', {
        fileSize: fileAnalysis.sizeFormatted,
        memoryRequired: fileAnalysis.memoryRequirementFormatted,
        solution: 'Enable streaming mode in timeline parser',
        code: `
// Update TimelineParserService to use streaming
const useStreaming = fileSize > ${fileAnalysis.size};
if (useStreaming) {
  const streamingParser = new StreamingJsonParser();
  const result = await streamingParser.parseStream(filePath);
}`,
        priority: 'high'
      }));
    }

    // Encoding issues
    if (fileAnalysis.encoding !== 'utf-8') {
      recommendations.push(this.createRecommendation('encoding_issue', {
        detectedEncoding: fileAnalysis.encoding,
        hasBOM: fileAnalysis.hasBOM,
        solution: 'Specify correct encoding when reading file',
        code: `
// Read file with correct encoding
const content = await readFile(filePath, '${fileAnalysis.encoding}');
${fileAnalysis.hasBOM ? '// Remove BOM if present\nconst cleanContent = content.replace(/^\\uFEFF/, "");' : ''}`,
        priority: 'medium'
      }));
    }

    // BOM handling
    if (fileAnalysis.hasBOM) {
      recommendations.push(this.createRecommendation('encoding_issue', {
        bomType: fileAnalysis.bomType,
        solution: 'Handle Byte Order Mark (BOM) before JSON parsing',
        code: `
// Remove BOM before parsing
const content = await readFile(filePath, 'utf-8');
const cleanContent = content.replace(/^\\uFEFF/, '');
const jsonData = JSON.parse(cleanContent);`,
        priority: 'medium'
      }));
    }

    return recommendations;
  }

  /**
   * Analyze structure issues
   */
  analyzeStructureIssues(structureAnalysis) {
    const recommendations = [];

    if (!structureAnalysis) return recommendations;

    // Missing timeline objects
    if (!structureAnalysis.hasTimelineObjects) {
      if (structureAnalysis.alternativePaths.length > 0) {
        // Timeline objects found at alternative paths
        const primaryPath = structureAnalysis.alternativePaths[0];
        recommendations.push(this.createRecommendation('alternative_path', {
          foundPath: primaryPath.path,
          objectCount: primaryPath.count,
          solution: `Update parser to access timeline objects at: ${primaryPath.path}`,
          code: this.generatePathAccessCode(primaryPath.path),
          priority: 'high'
        }));
      } else {
        // No timeline objects found anywhere
        recommendations.push(this.createRecommendation('missing_timeline_objects', {
          searchedPaths: Object.keys(structureAnalysis.structureMap),
          solution: 'Verify file format or check for data corruption',
          code: `
// Add debugging to understand file structure
console.log('File structure:', JSON.stringify(timelineData, null, 2));
// Look for alternative data structures
const possiblePaths = this.findTimelineData(timelineData);`,
          priority: 'critical'
        }));
      }
    }

    // Empty timeline objects
    if (structureAnalysis.hasTimelineObjects && structureAnalysis.timelineObjectsCount === 0) {
      recommendations.push(this.createRecommendation('empty_timeline_objects', {
        path: structureAnalysis.timelineObjectsPath,
        solution: 'Check Google Timeline export settings or data range',
        code: `
// Add validation for empty timeline objects
if (timelineData.timelineObjects && timelineData.timelineObjects.length === 0) {
  this.logger.warn('Timeline objects array is empty');
  // Consider alternative data sources or export settings
}`,
        priority: 'high'
      }));
    }

    // Unknown format
    if (structureAnalysis.detectedFormat === 'unknown') {
      recommendations.push(this.createRecommendation('unknown_format', {
        structureMap: structureAnalysis.structureMap,
        solution: 'Add support for new timeline format or update schema definitions',
        code: `
// Add new format detection
const customFormat = this.detectCustomFormat(timelineData);
if (customFormat) {
  return this.parseCustomFormat(timelineData, customFormat);
}`,
        priority: 'medium'
      }));
    }

    // Parse errors
    if (structureAnalysis.parseError) {
      const errorType = this.categorizeParseError(structureAnalysis.parseError.message);
      recommendations.push(this.createRecommendation(errorType, {
        errorMessage: structureAnalysis.parseError.message,
        position: structureAnalysis.parseError.position,
        solution: this.getParseErrorSolution(errorType),
        code: this.getParseErrorFixCode(errorType),
        priority: 'critical'
      }));
    }

    return recommendations;
  }

  /**
   * Analyze content issues
   */
  analyzeContentIssues(contentAnalysis) {
    const recommendations = [];

    if (!contentAnalysis) return recommendations;

    // Invalid coordinates
    if (contentAnalysis.coordinateValidation && 
        contentAnalysis.coordinateValidation.invalidCoordinates > 0) {
      const invalidPercent = (contentAnalysis.coordinateValidation.invalidCoordinates / 
                             contentAnalysis.coordinateValidation.totalCoordinates) * 100;
      
      recommendations.push(this.createRecommendation('invalid_coordinates', {
        invalidCount: contentAnalysis.coordinateValidation.invalidCoordinates,
        totalCount: contentAnalysis.coordinateValidation.totalCoordinates,
        percentage: invalidPercent.toFixed(1),
        solution: 'Add coordinate validation and filtering',
        code: `
// Add coordinate validation in TimelineParserService
isValidCoordinate(latitude, longitude) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180 &&
    !isNaN(latitude) && !isNaN(longitude)
  );
}`,
        priority: 'medium'
      }));
    }

    // Missing timestamps
    if (contentAnalysis.dataQuality && 
        contentAnalysis.dataQuality.validTimestampsPercent < 90) {
      recommendations.push(this.createRecommendation('missing_timestamps', {
        validPercent: contentAnalysis.dataQuality.validTimestampsPercent.toFixed(1),
        solution: 'Improve timestamp validation and handling',
        code: `
// Enhanced timestamp validation
isValidTimestamp(timestamp) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  return !isNaN(date.getTime()) && 
         date.getTime() > 0 && 
         date.getTime() < Date.now() + (365 * 24 * 60 * 60 * 1000); // Not more than 1 year in future
}`,
        priority: 'medium'
      }));
    }

    // Low GPS accuracy
    if (contentAnalysis.dataQuality && 
        contentAnalysis.dataQuality.accuracyDistribution.poor > 
        contentAnalysis.dataQuality.accuracyDistribution.excellent) {
      recommendations.push(this.createRecommendation('low_accuracy', {
        poorAccuracy: contentAnalysis.dataQuality.accuracyDistribution.poor,
        excellentAccuracy: contentAnalysis.dataQuality.accuracyDistribution.excellent,
        solution: 'Implement accuracy-based filtering and weighting',
        code: `
// Filter locations by accuracy threshold
const ACCURACY_THRESHOLD = 100; // meters
const filteredLocations = locations.filter(loc => 
  !loc.accuracy || loc.accuracy <= ACCURACY_THRESHOLD
);

// Weight locations by accuracy in interpolation
const weight = loc.accuracy ? Math.max(0, 1 - (loc.accuracy / 1000)) : 0.5;`,
        priority: 'low'
      }));
    }

    return recommendations;
  }

  /**
   * Generate integration recommendations
   */
  generateIntegrationRecommendations(diagnosticData) {
    const recommendations = [];

    // Parser enhancement recommendations
    if (diagnosticData.structureAnalysis && 
        diagnosticData.structureAnalysis.alternativePaths.length > 0) {
      recommendations.push({
        type: 'parser_enhancement',
        severity: 'medium',
        category: 'integration',
        title: 'Enhance Timeline Parser Flexibility',
        description: 'Update main application parser to handle multiple timeline formats',
        solution: 'Add format detection and multi-path parsing support',
        code: `
// Enhanced TimelineParserService with format detection
class EnhancedTimelineParserService extends TimelineParserService {
  async loadTimelineEdits() {
    const timelineJson = await readFile(this.timelineEditsPath, 'utf8');
    const timelineData = JSON.parse(timelineJson);
    
    // Detect format and extract timeline objects
    const timelineObjects = this.extractTimelineObjects(timelineData);
    
    // Process timeline objects
    for (const timelineObject of timelineObjects) {
      // ... existing processing logic
    }
  }
  
  extractTimelineObjects(data) {
    // Try standard path first
    if (data.timelineObjects) return data.timelineObjects;
    
    // Try alternative paths
    const alternativePaths = [
      'semanticSegments[].timelineObjects',
      'data.timeline.segments',
      // Add more paths as discovered
    ];
    
    for (const path of alternativePaths) {
      const objects = this.getValueByPath(data, path);
      if (objects && objects.length > 0) return objects;
    }
    
    return [];
  }
}`,
        impact: 'Improved compatibility with different timeline export formats',
        priority: 'medium'
      });
    }

    // Error handling recommendations
    recommendations.push({
      type: 'error_handling',
      severity: 'low',
      category: 'robustness',
      title: 'Improve Error Handling',
      description: 'Add comprehensive error handling for timeline parsing failures',
      solution: 'Implement graceful degradation and detailed error reporting',
      code: `
// Enhanced error handling in TimelineParserService
async loadTimelineEdits() {
  try {
    const timelineJson = await readFile(this.timelineEditsPath, 'utf8');
    const timelineData = JSON.parse(timelineJson);
    
    // ... processing logic
    
  } catch (error) {
    this.logger.error('Timeline parsing failed:', error.message);
    
    // Try diagnostic analysis
    const diagnostic = new TimelineDiagnostic();
    const analysis = await diagnostic.analyze(this.timelineEditsPath);
    
    // Log specific recommendations
    analysis.recommendations.forEach(rec => {
      this.logger.warn(\`Recommendation: \${rec.title} - \${rec.solution}\`);
    });
    
    // Graceful degradation - continue with empty timeline
    this.logger.warn('Continuing with empty timeline data');
    return;
  }
}`,
      impact: 'Better user experience and debugging capabilities',
      priority: 'low'
    });

    return recommendations;
  }

  /**
   * Create recommendation object
   */
  createRecommendation(type, details) {
    const template = this.findTemplate(type);
    
    return {
      type,
      severity: template.severity,
      category: template.category,
      title: template.title,
      description: template.description,
      impact: template.impact,
      solution: details.solution,
      code: details.code,
      priority: details.priority || template.severity,
      details
    };
  }

  /**
   * Find recommendation template
   */
  findTemplate(type) {
    for (const category of Object.values(this.templates)) {
      if (category[type]) {
        return category[type];
      }
    }
    
    // Default template
    return {
      severity: 'medium',
      category: 'general',
      title: 'Issue Detected',
      description: 'An issue was detected that may affect timeline processing',
      impact: 'Timeline processing may be affected'
    };
  }

  /**
   * Generate code for accessing alternative path
   */
  generatePathAccessCode(path) {
    const parts = path.split('.');
    let code = 'timelineData';
    
    parts.forEach(part => {
      if (part.includes('[') && part.includes(']')) {
        const [arrayName, indexPart] = part.split('[');
        const index = indexPart.replace(']', '');
        
        if (arrayName) {
          code += `.${arrayName}`;
        }
        
        if (isNaN(index)) {
          // Dynamic array access
          code += `?.flatMap(item => item.${index} || [])`;
        } else {
          code += `[${index}]`;
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

  /**
   * Categorize parse error type
   */
  categorizeParseError(errorMessage) {
    const message = errorMessage.toLowerCase();
    
    if (message.includes('unexpected token') || message.includes('invalid character')) {
      return 'syntax_error';
    }
    
    if (message.includes('unexpected end') || message.includes('truncated')) {
      return 'truncated_file';
    }
    
    if (message.includes('encoding') || message.includes('character')) {
      return 'encoding_issue';
    }
    
    return 'syntax_error'; // Default
  }

  /**
   * Get solution for parse error type
   */
  getParseErrorSolution(errorType) {
    const solutions = {
      syntax_error: 'Fix JSON syntax errors using a JSON validator or linter',
      truncated_file: 'Re-export timeline data from Google Takeout',
      encoding_issue: 'Convert file to UTF-8 encoding without BOM'
    };
    
    return solutions[errorType] || 'Manual inspection and correction required';
  }

  /**
   * Get fix code for parse error type
   */
  getParseErrorFixCode(errorType) {
    const codes = {
      syntax_error: `
// Add JSON validation before parsing
try {
  const content = await readFile(filePath, 'utf-8');
  // Basic syntax validation
  if (!content.trim().startsWith('{') && !content.trim().startsWith('[')) {
    throw new Error('Invalid JSON format');
  }
  const jsonData = JSON.parse(content);
} catch (parseError) {
  this.logger.error('JSON parsing failed:', parseError.message);
  // Try partial parsing or manual fixes
}`,
      truncated_file: `
// Detect and handle truncated files
const content = await readFile(filePath, 'utf-8');
if (!content.trim().endsWith('}') && !content.trim().endsWith(']')) {
  this.logger.warn('File appears to be truncated');
  // Attempt partial parsing or request re-export
}`,
      encoding_issue: `
// Handle encoding issues
const buffer = await readFile(filePath);
const encoding = detectEncoding(buffer);
const content = buffer.toString(encoding);
// Remove BOM if present
const cleanContent = content.replace(/^\\uFEFF/, '');
const jsonData = JSON.parse(cleanContent);`
    };
    
    return codes[errorType] || '// Manual inspection required';
  }

  /**
   * Prioritize recommendations by severity and impact
   */
  prioritizeRecommendations(recommendations) {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    
    return recommendations.sort((a, b) => {
      // Sort by severity first
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      
      // Then by priority
      const priorityDiff = severityOrder[a.priority] - severityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Finally by type (structure issues first)
      const categoryOrder = { structure: 0, parsing: 1, data_quality: 2, integration: 3 };
      return categoryOrder[a.category] - categoryOrder[b.category];
    });
  }
}

export default RecommendationsEngine;