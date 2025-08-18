/**
 * Report Generator
 * 
 * Generates diagnostic reports in multiple formats (console, JSON, markdown)
 * with comprehensive analysis results and recommendations.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { writeFile } from 'fs/promises';

/**
 * Report generator for Timeline diagnostic utility
 */
class ReportGenerator {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Generate report in specified format
   */
  async generateReport(diagnosticReport, format = 'console') {
    this.logger.time('Report Generation');
    this.logger.info(`Generating ${format} report...`);

    try {
      let output;

      switch (format.toLowerCase()) {
        case 'json':
          output = this.generateJsonReport(diagnosticReport);
          break;
        case 'markdown':
        case 'md':
          output = this.generateMarkdownReport(diagnosticReport);
          break;
        case 'console':
        default:
          output = this.generateConsoleReport(diagnosticReport);
          break;
      }

      this.logger.timeEnd('Report Generation');
      return output;

    } catch (error) {
      this.logger.error('Report generation failed:', error.message);
      throw new Error(`Report generation failed: ${error.message}`);
    }
  }

  /**
   * Save report to file
   */
  async saveReport(reportContent, filePath, format = 'json') {
    try {
      await writeFile(filePath, reportContent, 'utf-8');
      this.logger.info(`Report saved to: ${filePath}`);
    } catch (error) {
      this.logger.error('Failed to save report:', error.message);
      throw new Error(`Failed to save report: ${error.message}`);
    }
  }

  /**
   * Generate JSON report
   */
  generateJsonReport(diagnosticReport) {
    // Clean up the report for JSON serialization
    const cleanReport = this.cleanReportForSerialization(diagnosticReport);
    return JSON.stringify(cleanReport, null, 2);
  }

  /**
   * Generate console report
   */
  generateConsoleReport(diagnosticReport) {
    const lines = [];
    
    // Header
    lines.push('');
    lines.push('🔍 TIMELINE DIAGNOSTIC REPORT');
    lines.push('═'.repeat(50));
    lines.push('');

    // File Information
    lines.push('📁 FILE ANALYSIS');
    lines.push('─'.repeat(30));
    if (diagnosticReport.fileAnalysis) {
      const file = diagnosticReport.fileAnalysis;
      lines.push(`File: ${diagnosticReport.diagnostic.filePath}`);
      lines.push(`Size: ${file.sizeFormatted}`);
      lines.push(`Encoding: ${file.encoding}${file.hasBOM ? ' (with BOM)' : ''}`);
      lines.push(`Memory Required: ${file.memoryRequirementFormatted}`);
      lines.push(`Processing Mode: ${file.processingMode}`);
      
      if (file.warnings && file.warnings.length > 0) {
        lines.push('⚠️  Warnings:');
        file.warnings.forEach(warning => lines.push(`   • ${warning}`));
      }
    }
    lines.push('');

    // Structure Analysis
    lines.push('🏗️  STRUCTURE ANALYSIS');
    lines.push('─'.repeat(30));
    if (diagnosticReport.structureAnalysis) {
      const structure = diagnosticReport.structureAnalysis;
      lines.push(`Valid JSON: ${structure.isValidJSON ? '✅' : '❌'}`);
      lines.push(`Timeline Objects Found: ${structure.hasTimelineObjects ? '✅' : '❌'}`);
      
      if (structure.hasTimelineObjects) {
        lines.push(`Timeline Objects Path: ${structure.timelineObjectsPath}`);
        lines.push(`Timeline Objects Count: ${structure.timelineObjectsCount}`);
      }
      
      lines.push(`Detected Format: ${structure.detectedFormat || 'Unknown'}`);
      
      if (structure.alternativePaths && structure.alternativePaths.length > 0) {
        lines.push('Alternative Paths Found:');
        structure.alternativePaths.forEach(path => {
          lines.push(`   • ${path.path} (${path.count} objects)`);
        });
      }
      
      if (structure.issues && structure.issues.length > 0) {
        lines.push('❌ Issues:');
        structure.issues.forEach(issue => lines.push(`   • ${issue}`));
      }
    }
    lines.push('');

    // Content Analysis
    if (diagnosticReport.contentAnalysis) {
      lines.push('📊 CONTENT ANALYSIS');
      lines.push('─'.repeat(30));
      const content = diagnosticReport.contentAnalysis;
      
      lines.push(`Total Records: ${content.totalRecords}`);
      lines.push(`Activity Segments: ${content.activitySegments}`);
      lines.push(`Place Visits: ${content.placeVisits}`);
      
      if (content.dataQuality) {
        lines.push('');
        lines.push('Data Quality:');
        lines.push(`   Valid Coordinates: ${content.dataQuality.validCoordinatesPercent?.toFixed(1) || 'N/A'}%`);
        lines.push(`   Valid Timestamps: ${content.dataQuality.validTimestampsPercent?.toFixed(1) || 'N/A'}%`);
      }
      
      if (content.statistics) {
        lines.push('');
        lines.push('Quality Scores:');
        lines.push(`   Completeness: ${content.statistics.quality.completenessScore.toFixed(1)}%`);
        lines.push(`   Accuracy: ${content.statistics.quality.accuracyScore.toFixed(1)}%`);
        lines.push(`   Consistency: ${content.statistics.quality.consistencyScore.toFixed(1)}%`);
        lines.push(`   Overall: ${content.statistics.quality.overallScore.toFixed(1)}%`);
      }
      
      lines.push('');
    }

    // Recommendations
    if (diagnosticReport.recommendations && diagnosticReport.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS');
      lines.push('─'.repeat(30));
      
      const criticalRecs = diagnosticReport.recommendations.filter(r => r.severity === 'critical');
      const highRecs = diagnosticReport.recommendations.filter(r => r.severity === 'high');
      const mediumRecs = diagnosticReport.recommendations.filter(r => r.severity === 'medium');
      const lowRecs = diagnosticReport.recommendations.filter(r => r.severity === 'low');
      
      if (criticalRecs.length > 0) {
        lines.push('🚨 CRITICAL ISSUES:');
        criticalRecs.forEach(rec => {
          lines.push(`   • ${rec.title}`);
          lines.push(`     ${rec.description}`);
          lines.push(`     Solution: ${rec.solution}`);
          lines.push('');
        });
      }
      
      if (highRecs.length > 0) {
        lines.push('⚠️  HIGH PRIORITY:');
        highRecs.forEach(rec => {
          lines.push(`   • ${rec.title}`);
          lines.push(`     ${rec.description}`);
          lines.push(`     Solution: ${rec.solution}`);
          lines.push('');
        });
      }
      
      if (mediumRecs.length > 0) {
        lines.push('📋 MEDIUM PRIORITY:');
        mediumRecs.forEach(rec => {
          lines.push(`   • ${rec.title}: ${rec.solution}`);
        });
        lines.push('');
      }
      
      if (lowRecs.length > 0) {
        lines.push('💭 SUGGESTIONS:');
        lowRecs.forEach(rec => {
          lines.push(`   • ${rec.title}: ${rec.solution}`);
        });
        lines.push('');
      }
    }

    // Summary
    lines.push('📈 SUMMARY');
    lines.push('─'.repeat(30));
    const summary = this.generateSummary(diagnosticReport);
    Object.entries(summary).forEach(([key, value]) => {
      lines.push(`${key}: ${value}`);
    });
    
    lines.push('');
    lines.push('═'.repeat(50));
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Diagnostic Version: ${diagnosticReport.diagnostic.version}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(diagnosticReport) {
    const lines = [];
    
    // Header
    lines.push('# Timeline Diagnostic Report');
    lines.push('');
    lines.push(`**File:** ${diagnosticReport.diagnostic.filePath}`);
    lines.push(`**Generated:** ${diagnosticReport.diagnostic.timestamp}`);
    lines.push(`**Version:** ${diagnosticReport.diagnostic.version}`);
    lines.push('');

    // File Analysis
    lines.push('## 📁 File Analysis');
    lines.push('');
    if (diagnosticReport.fileAnalysis) {
      const file = diagnosticReport.fileAnalysis;
      lines.push('| Property | Value |');
      lines.push('|----------|-------|');
      lines.push(`| Size | ${file.sizeFormatted} |`);
      lines.push(`| Encoding | ${file.encoding}${file.hasBOM ? ' (with BOM)' : ''} |`);
      lines.push(`| Memory Required | ${file.memoryRequirementFormatted} |`);
      lines.push(`| Processing Mode | ${file.processingMode} |`);
      lines.push(`| Risk Level | ${file.riskLevel} |`);
      
      if (file.warnings && file.warnings.length > 0) {
        lines.push('');
        lines.push('### ⚠️ Warnings');
        file.warnings.forEach(warning => lines.push(`- ${warning}`));
      }
    }
    lines.push('');

    // Structure Analysis
    lines.push('## 🏗️ Structure Analysis');
    lines.push('');
    if (diagnosticReport.structureAnalysis) {
      const structure = diagnosticReport.structureAnalysis;
      lines.push('| Property | Value |');
      lines.push('|----------|-------|');
      lines.push(`| Valid JSON | ${structure.isValidJSON ? '✅ Yes' : '❌ No'} |`);
      lines.push(`| Timeline Objects Found | ${structure.hasTimelineObjects ? '✅ Yes' : '❌ No'} |`);
      
      if (structure.hasTimelineObjects) {
        lines.push(`| Timeline Objects Path | \`${structure.timelineObjectsPath}\` |`);
        lines.push(`| Timeline Objects Count | ${structure.timelineObjectsCount} |`);
      }
      
      lines.push(`| Detected Format | ${structure.detectedFormat || 'Unknown'} |`);
      
      if (structure.alternativePaths && structure.alternativePaths.length > 0) {
        lines.push('');
        lines.push('### Alternative Paths');
        structure.alternativePaths.forEach(path => {
          lines.push(`- \`${path.path}\` (${path.count} objects)`);
        });
      }
      
      if (structure.schemaMatches && structure.schemaMatches.length > 0) {
        lines.push('');
        lines.push('### Schema Matches');
        structure.schemaMatches.forEach(match => {
          lines.push(`- **${match.name}** (Score: ${match.score})`);
        });
      }
      
      if (structure.issues && structure.issues.length > 0) {
        lines.push('');
        lines.push('### ❌ Issues');
        structure.issues.forEach(issue => lines.push(`- ${issue}`));
      }
    }
    lines.push('');

    // Content Analysis
    if (diagnosticReport.contentAnalysis) {
      lines.push('## 📊 Content Analysis');
      lines.push('');
      const content = diagnosticReport.contentAnalysis;
      
      lines.push('### Overview');
      lines.push('| Metric | Value |');
      lines.push('|--------|-------|');
      lines.push(`| Total Records | ${content.totalRecords} |`);
      lines.push(`| Activity Segments | ${content.activitySegments} |`);
      lines.push(`| Place Visits | ${content.placeVisits} |`);
      
      if (content.dataQuality) {
        lines.push('');
        lines.push('### Data Quality');
        lines.push('| Metric | Value |');
        lines.push('|--------|-------|');
        lines.push(`| Valid Coordinates | ${content.dataQuality.validCoordinatesPercent?.toFixed(1) || 'N/A'}% |`);
        lines.push(`| Valid Timestamps | ${content.dataQuality.validTimestampsPercent?.toFixed(1) || 'N/A'}% |`);
        
        if (content.dataQuality.accuracyDistribution) {
          lines.push('');
          lines.push('### GPS Accuracy Distribution');
          lines.push('| Level | Count |');
          lines.push('|-------|-------|');
          Object.entries(content.dataQuality.accuracyDistribution).forEach(([level, count]) => {
            lines.push(`| ${level} | ${count} |`);
          });
        }
      }
      
      if (content.statistics) {
        lines.push('');
        lines.push('### Quality Scores');
        lines.push('| Score | Value |');
        lines.push('|-------|-------|');
        lines.push(`| Completeness | ${content.statistics.quality.completenessScore.toFixed(1)}% |`);
        lines.push(`| Accuracy | ${content.statistics.quality.accuracyScore.toFixed(1)}% |`);
        lines.push(`| Consistency | ${content.statistics.quality.consistencyScore.toFixed(1)}% |`);
        lines.push(`| **Overall** | **${content.statistics.quality.overallScore.toFixed(1)}%** |`);
      }
      
      lines.push('');
    }

    // Recommendations
    if (diagnosticReport.recommendations && diagnosticReport.recommendations.length > 0) {
      lines.push('## 💡 Recommendations');
      lines.push('');
      
      const groupedRecs = this.groupRecommendationsBySeverity(diagnosticReport.recommendations);
      
      Object.entries(groupedRecs).forEach(([severity, recs]) => {
        if (recs.length === 0) return;
        
        const severityEmoji = {
          critical: '🚨',
          high: '⚠️',
          medium: '📋',
          low: '💭'
        };
        
        lines.push(`### ${severityEmoji[severity]} ${severity.toUpperCase()} Priority`);
        lines.push('');
        
        recs.forEach((rec, index) => {
          lines.push(`#### ${index + 1}. ${rec.title}`);
          lines.push('');
          lines.push(`**Description:** ${rec.description}`);
          lines.push('');
          lines.push(`**Impact:** ${rec.impact}`);
          lines.push('');
          lines.push(`**Solution:** ${rec.solution}`);
          
          if (rec.code) {
            lines.push('');
            lines.push('**Implementation:**');
            lines.push('```javascript');
            lines.push(rec.code.trim());
            lines.push('```');
          }
          
          lines.push('');
        });
      });
    }

    // Summary
    lines.push('## 📈 Summary');
    lines.push('');
    const summary = this.generateSummary(diagnosticReport);
    Object.entries(summary).forEach(([key, value]) => {
      lines.push(`- **${key}:** ${value}`);
    });
    
    lines.push('');
    lines.push('---');
    lines.push(`*Report generated by Timeline Diagnostic Utility v${diagnosticReport.diagnostic.version}*`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate summary statistics
   */
  generateSummary(diagnosticReport) {
    const summary = {};
    
    // File summary
    if (diagnosticReport.fileAnalysis) {
      summary['File Size'] = diagnosticReport.fileAnalysis.sizeFormatted;
      summary['Processing Mode'] = diagnosticReport.fileAnalysis.processingMode;
    }
    
    // Structure summary
    if (diagnosticReport.structureAnalysis) {
      summary['Valid JSON'] = diagnosticReport.structureAnalysis.isValidJSON ? 'Yes' : 'No';
      summary['Timeline Objects Found'] = diagnosticReport.structureAnalysis.hasTimelineObjects ? 'Yes' : 'No';
      summary['Timeline Objects Count'] = diagnosticReport.structureAnalysis.timelineObjectsCount || 0;
      summary['Detected Format'] = diagnosticReport.structureAnalysis.detectedFormat || 'Unknown';
    }
    
    // Content summary
    if (diagnosticReport.contentAnalysis) {
      summary['Total Records'] = diagnosticReport.contentAnalysis.totalRecords;
      summary['Activity Segments'] = diagnosticReport.contentAnalysis.activitySegments;
      summary['Place Visits'] = diagnosticReport.contentAnalysis.placeVisits;
      
      if (diagnosticReport.contentAnalysis.statistics) {
        summary['Overall Quality Score'] = `${diagnosticReport.contentAnalysis.statistics.quality.overallScore.toFixed(1)}%`;
      }
    }
    
    // Recommendations summary
    if (diagnosticReport.recommendations) {
      const recCounts = this.countRecommendationsBySeverity(diagnosticReport.recommendations);
      summary['Critical Issues'] = recCounts.critical;
      summary['High Priority Issues'] = recCounts.high;
      summary['Total Recommendations'] = diagnosticReport.recommendations.length;
    }
    
    return summary;
  }

  /**
   * Group recommendations by severity
   */
  groupRecommendationsBySeverity(recommendations) {
    return {
      critical: recommendations.filter(r => r.severity === 'critical'),
      high: recommendations.filter(r => r.severity === 'high'),
      medium: recommendations.filter(r => r.severity === 'medium'),
      low: recommendations.filter(r => r.severity === 'low')
    };
  }

  /**
   * Count recommendations by severity
   */
  countRecommendationsBySeverity(recommendations) {
    const grouped = this.groupRecommendationsBySeverity(recommendations);
    return {
      critical: grouped.critical.length,
      high: grouped.high.length,
      medium: grouped.medium.length,
      low: grouped.low.length
    };
  }

  /**
   * Clean report for JSON serialization
   */
  cleanReportForSerialization(report) {
    // Deep clone to avoid modifying original
    const cleaned = JSON.parse(JSON.stringify(report));
    
    // Convert any remaining Sets or Maps to arrays/objects
    this.convertSetsAndMaps(cleaned);
    
    return cleaned;
  }

  /**
   * Convert Sets and Maps to serializable formats
   */
  convertSetsAndMaps(obj) {
    if (obj === null || typeof obj !== 'object') return;
    
    if (obj instanceof Set) {
      return Array.from(obj);
    }
    
    if (obj instanceof Map) {
      return Object.fromEntries(obj);
    }
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        obj[index] = this.convertSetsAndMaps(item);
      });
    } else {
      Object.keys(obj).forEach(key => {
        obj[key] = this.convertSetsAndMaps(obj[key]);
      });
    }
    
    return obj;
  }
}

export default ReportGenerator;