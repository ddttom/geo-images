#!/usr/bin/env node

/**
 * Timeline Diagnostic Utility
 * 
 * A standalone CLI tool for analyzing Google Timeline Edits.json files
 * to identify parsing and processing issues.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 * @version 1.0.0
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import process from 'process';

// Import diagnostic components
import FileAnalyzer from './lib/fileAnalyzer.js';
import StreamingJsonParser from './lib/streamingJsonParser.js';
import StructureAnalyzer from './lib/structureAnalyzer.js';
import ContentAnalyzer from './lib/contentAnalyzer.js';
import ReportGenerator from './lib/reportGenerator.js';
import RecommendationsEngine from './lib/recommendationsEngine.js';
import DiagnosticLogger from './lib/diagnosticLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main Timeline Diagnostic CLI class
 */
class TimelineDiagnosticCLI {
  constructor() {
    this.version = '1.0.0';
    this.logger = new DiagnosticLogger();
    this.options = this.parseCommandLineArgs();
    
    // Initialize diagnostic components
    this.fileAnalyzer = new FileAnalyzer(this.logger);
    this.streamingParser = new StreamingJsonParser(this.logger);
    this.structureAnalyzer = new StructureAnalyzer(this.logger);
    this.contentAnalyzer = new ContentAnalyzer(this.logger);
    this.reportGenerator = new ReportGenerator(this.logger);
    this.recommendationsEngine = new RecommendationsEngine(this.logger);
  }

  /**
   * Parse command line arguments
   */
  parseCommandLineArgs() {
    const args = process.argv.slice(2);
    const options = {
      filePath: null,
      format: 'console',
      output: null,
      streaming: false,
      chunkSize: '10MB',
      structureOnly: false,
      sampleSize: 1000,
      verbose: false,
      quiet: false,
      help: false,
      version: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--help':
        case '-h':
          options.help = true;
          break;
        case '--version':
        case '-v':
          options.version = true;
          break;
        case '--format':
        case '-f':
          options.format = args[++i] || 'console';
          break;
        case '--output':
        case '-o':
          options.output = args[++i];
          break;
        case '--streaming':
        case '-s':
          options.streaming = true;
          break;
        case '--chunk-size':
          options.chunkSize = args[++i] || '10MB';
          break;
        case '--structure-only':
          options.structureOnly = true;
          break;
        case '--sample-size':
          options.sampleSize = parseInt(args[++i]) || 1000;
          break;
        case '--verbose':
          options.verbose = true;
          break;
        case '--quiet':
        case '-q':
          options.quiet = true;
          break;
        default:
          if (!arg.startsWith('-') && !options.filePath) {
            options.filePath = arg;
          }
          break;
      }
    }

    return options;
  }

  /**
   * Display help information
   */
  displayHelp() {
    console.log(`
Timeline Diagnostic Utility v${this.version}

USAGE:
  node timeline-diagnostic.js <file> [options]

ARGUMENTS:
  <file>                    Path to Timeline Edits.json file

OPTIONS:
  -f, --format <format>     Output format: console, json, markdown (default: console)
  -o, --output <file>       Output file path
  -s, --streaming           Force streaming mode for large files
  --chunk-size <size>       Memory chunk size (default: 10MB)
  --structure-only          Skip content analysis for faster results
  --sample-size <number>    Number of records to sample (default: 1000)
  --verbose                 Detailed logging output
  -q, --quiet               Minimal output mode
  -h, --help                Show this help message
  -v, --version             Show version information

EXAMPLES:
  # Basic analysis
  node timeline-diagnostic.js data/Timeline\\ Edits.json

  # JSON output to file
  node timeline-diagnostic.js data/Timeline\\ Edits.json --format json --output report.json

  # Memory-constrained analysis
  node timeline-diagnostic.js data/Timeline\\ Edits.json --streaming --chunk-size 1MB

  # Quick structure analysis
  node timeline-diagnostic.js data/Timeline\\ Edits.json --structure-only
`);
  }

  /**
   * Display version information
   */
  displayVersion() {
    console.log(`Timeline Diagnostic Utility v${this.version}`);
  }

  /**
   * Validate command line options
   */
  validateOptions() {
    if (this.options.help) {
      this.displayHelp();
      return false;
    }

    if (this.options.version) {
      this.displayVersion();
      return false;
    }

    if (!this.options.filePath) {
      console.error('Error: Timeline file path is required');
      console.error('Use --help for usage information');
      return false;
    }

    const filePath = resolve(this.options.filePath);
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      return false;
    }

    // Validate format option
    const validFormats = ['console', 'json', 'markdown'];
    if (!validFormats.includes(this.options.format)) {
      console.error(`Error: Invalid format '${this.options.format}'. Valid formats: ${validFormats.join(', ')}`);
      return false;
    }

    return true;
  }

  /**
   * Parse chunk size string to bytes
   */
  parseChunkSize(sizeStr) {
    const units = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
    if (!match) {
      throw new Error(`Invalid chunk size format: ${sizeStr}`);
    }

    const value = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase();
    
    return Math.floor(value * units[unit]);
  }

  /**
   * Run the diagnostic analysis
   */
  async run() {
    try {
      // Validate options
      if (!this.validateOptions()) {
        process.exit(1);
      }

      // Configure logger
      this.logger.setVerbose(this.options.verbose);
      this.logger.setQuiet(this.options.quiet);

      const filePath = resolve(this.options.filePath);
      
      if (!this.options.quiet) {
        console.log(`🔍 Analyzing Timeline file: ${filePath}`);
        console.log('');
      }

      // Phase 1: File Analysis
      this.logger.info('Starting file analysis...');
      const fileAnalysis = await this.fileAnalyzer.analyzeFile(filePath);
      
      if (!this.options.quiet) {
        console.log(`📁 File Size: ${this.formatBytes(fileAnalysis.size)}`);
        console.log(`📝 Encoding: ${fileAnalysis.encoding}`);
        if (fileAnalysis.hasBOM) {
          console.log('⚠️  BOM detected');
        }
      }

      // Determine processing mode
      const chunkSizeBytes = this.parseChunkSize(this.options.chunkSize);
      const useStreaming = this.options.streaming || fileAnalysis.recommendStreaming;
      
      if (useStreaming && !this.options.quiet) {
        console.log(`🌊 Using streaming mode (chunk size: ${this.options.chunkSize})`);
      }

      // Phase 2: JSON Structure Analysis
      this.logger.info('Starting structure analysis...');
      let jsonData = null;
      let structureAnalysis = null;

      try {
        if (useStreaming) {
          const parseResult = await this.streamingParser.parseStream(filePath, {
            chunkSize: chunkSizeBytes,
            structureOnly: this.options.structureOnly
          });
          jsonData = parseResult.data;
          structureAnalysis = await this.structureAnalyzer.analyzeStructure(parseResult.structure);
        } else {
          jsonData = await this.streamingParser.parseFile(filePath);
          structureAnalysis = await this.structureAnalyzer.analyzeStructure(jsonData);
        }
      } catch (error) {
        this.logger.error('JSON parsing failed:', error.message);
        structureAnalysis = await this.structureAnalyzer.analyzePartialStructure(filePath, error);
      }

      // Phase 3: Content Analysis (if not structure-only)
      let contentAnalysis = null;
      if (!this.options.structureOnly && jsonData) {
        this.logger.info('Starting content analysis...');
        contentAnalysis = await this.contentAnalyzer.analyzeContent(jsonData, {
          sampleSize: this.options.sampleSize,
          streaming: useStreaming
        });
      }

      // Phase 4: Generate Recommendations
      this.logger.info('Generating recommendations...');
      const recommendations = await this.recommendationsEngine.generateRecommendations({
        fileAnalysis,
        structureAnalysis,
        contentAnalysis
      });

      // Phase 5: Generate Report
      const diagnosticReport = {
        diagnostic: {
          timestamp: new Date().toISOString(),
          filePath: filePath,
          version: this.version,
          options: this.options
        },
        fileAnalysis,
        structureAnalysis,
        contentAnalysis,
        recommendations
      };

      // Output report
      await this.outputReport(diagnosticReport);

      if (!this.options.quiet) {
        console.log('');
        console.log('✅ Diagnostic analysis completed successfully');
      }

    } catch (error) {
      this.logger.error('Diagnostic analysis failed:', error);
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Output the diagnostic report
   */
  async outputReport(report) {
    const output = await this.reportGenerator.generateReport(report, this.options.format);

    if (this.options.output) {
      await this.reportGenerator.saveReport(output, this.options.output, this.options.format);
      if (!this.options.quiet) {
        console.log(`📄 Report saved to: ${this.options.output}`);
      }
    } else {
      console.log(output);
    }
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

// Run the CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new TimelineDiagnosticCLI();
  cli.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default TimelineDiagnosticCLI;