# Timeline Diagnostic Utility

A comprehensive standalone CLI tool for analyzing Google Timeline Edits.json files to identify parsing and processing issues.

## Overview

This diagnostic utility helps identify why timeline data processing fails by analyzing file structure, content quality, and compatibility with the main geo-images application. It provides detailed reports and actionable recommendations for fixing issues.

## Features

- **File Analysis**: Size validation, encoding detection, BOM handling, memory usage estimation
- **JSON Structure Analysis**: Schema validation, timeline object detection at any nesting level
- **Content Analysis**: Data quality assessment, coordinate validation, temporal coverage analysis
- **Streaming Processing**: Memory-safe processing for files of any size
- **Error Recovery**: Handles malformed JSON with partial parsing capabilities
- **Multiple Output Formats**: Console, JSON, and Markdown reports
- **Actionable Recommendations**: Specific code suggestions for fixing issues

## Installation

No installation required. The utility is self-contained and uses only Node.js built-in modules.

## Usage

### Basic Analysis
```bash
node tools/timeline-diagnostic.js data/Timeline\ Edits.json
```

### JSON Output to File
```bash
node tools/timeline-diagnostic.js data/Timeline\ Edits.json --format json --output diagnostic-report.json
```

### Memory-Constrained Analysis
```bash
node tools/timeline-diagnostic.js data/Timeline\ Edits.json --streaming --chunk-size 1MB
```

### Quick Structure Analysis
```bash
node tools/timeline-diagnostic.js data/Timeline\ Edits.json --structure-only --sample-size 1000
```

### Markdown Report
```bash
node tools/timeline-diagnostic.js data/Timeline\ Edits.json --format markdown --output report.md
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--format`, `-f` | Output format: console, json, markdown | console |
| `--output`, `-o` | Output file path | stdout |
| `--streaming`, `-s` | Force streaming mode for large files | auto-detect |
| `--chunk-size` | Memory chunk size for streaming | 10MB |
| `--structure-only` | Skip content analysis for faster results | false |
| `--sample-size` | Number of records to sample for analysis | 1000 |
| `--verbose` | Detailed logging output | false |
| `--quiet`, `-q` | Minimal output mode | false |
| `--help`, `-h` | Show help message | - |
| `--version`, `-v` | Show version information | - |

## Architecture

The diagnostic utility consists of several specialized components:

### Core Components

- **DiagnosticLogger**: Standalone logging system with multiple output levels
- **FileAnalyzer**: File system analysis, encoding detection, memory estimation
- **StreamingJsonParser**: Memory-safe JSON parsing for any file size
- **StructureAnalyzer**: JSON structure validation and schema comparison
- **ContentAnalyzer**: Data quality assessment and statistical analysis
- **RecommendationsEngine**: Generates specific fix recommendations
- **ReportGenerator**: Multi-format report generation

### Processing Flow

1. **File Analysis**: Analyze file properties, encoding, and memory requirements
2. **Structure Analysis**: Parse JSON structure and validate against known schemas
3. **Content Analysis**: Sample and analyze timeline data quality (optional)
4. **Recommendations**: Generate specific recommendations based on findings
5. **Report Generation**: Output comprehensive diagnostic report

## Output Formats

### Console Output
Human-readable report with color-coded sections and priority-based recommendations.

### JSON Output
Structured data format suitable for programmatic processing:

```json
{
  "diagnostic": {
    "timestamp": "2024-01-15T12:00:00Z",
    "filePath": "data/Timeline Edits.json",
    "version": "1.0.0"
  },
  "fileAnalysis": {
    "size": 157286400,
    "encoding": "UTF-8",
    "recommendStreaming": true
  },
  "structureAnalysis": {
    "hasTimelineObjects": false,
    "alternativePaths": ["semanticSegments[].timelineObjects"]
  },
  "recommendations": [
    {
      "type": "alternative_path",
      "severity": "high",
      "solution": "Update parser to use alternative path",
      "code": "// Implementation code here"
    }
  ]
}
```

### Markdown Output
Formatted report suitable for documentation and sharing.

## Common Issues and Solutions

### Issue: 0 Timeline Objects Processed

**Cause**: Timeline objects not found at expected root-level `timelineObjects` path.

**Solution**: The diagnostic will identify alternative paths where timeline objects exist and provide specific code to access them.

### Issue: JSON Parsing Errors

**Cause**: Malformed JSON, encoding issues, or file corruption.

**Solution**: The diagnostic provides specific error locations and suggested fixes, including BOM removal and encoding conversion.

### Issue: Memory Errors

**Cause**: File too large for standard JSON parsing.

**Solution**: Automatic detection triggers streaming mode with configurable chunk sizes.

### Issue: Invalid Coordinates

**Cause**: Coordinates outside valid ranges or in unexpected formats.

**Solution**: Detailed coordinate validation with specific recommendations for filtering and conversion.

## Integration with Main Application

The diagnostic utility generates actionable recommendations that can be directly integrated into the main geo-images application:

1. **Parser Updates**: Specific code suggestions for handling alternative timeline formats
2. **Error Handling**: Enhanced error recovery and logging recommendations
3. **Performance Optimizations**: Memory usage and streaming recommendations
4. **Data Validation**: Coordinate and timestamp validation improvements

## Examples

### Analyzing a Large Timeline File
```bash
# The diagnostic will automatically detect if streaming is needed
node tools/timeline-diagnostic.js data/Timeline\ Edits.json --verbose

# Force streaming mode with custom chunk size
node tools/timeline-diagnostic.js data/Timeline\ Edits.json --streaming --chunk-size 5MB
```

### Quick Structure Check
```bash
# Fast analysis focusing only on JSON structure
node tools/timeline-diagnostic.js data/Timeline\ Edits.json --structure-only --quiet
```

### Generating Reports for Documentation
```bash
# Generate markdown report for sharing
node tools/timeline-diagnostic.js data/Timeline\ Edits.json \
  --format markdown \
  --output timeline-analysis-report.md

# Generate JSON report for programmatic processing
node tools/timeline-diagnostic.js data/Timeline\ Edits.json \
  --format json \
  --output diagnostic-data.json
```

## Troubleshooting

### Permission Errors
Ensure the utility has read access to the timeline file:
```bash
chmod +r data/Timeline\ Edits.json
```

### Memory Issues
Use streaming mode for large files:
```bash
node --max-old-space-size=4096 tools/timeline-diagnostic.js data/Timeline\ Edits.json --streaming
```

### Encoding Problems
The diagnostic will detect and recommend encoding fixes automatically.

## Contributing

The diagnostic utility is designed to be easily extensible:

- Add new timeline format schemas in `StructureAnalyzer`
- Extend content analysis in `ContentAnalyzer`
- Add new recommendation types in `RecommendationsEngine`
- Support additional output formats in `ReportGenerator`

## License

MIT License - see main project LICENSE file.