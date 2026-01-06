# BACnet ASN.1 Parser

A lightweight Node.js parser for ASN.1 notation of BACnet data types.

## Features

- ✅ **Parse** ASN.1 definitions of BACnet data types into structured objects
- ✅ **Normalize** parsed definitions into BAClib-compliant kebab-case format
- ✅ **Predefined types** library with standard BACnet primitive types
- ✅ Support for ENUMERATED, SEQUENCE, CHOICE, BIT STRING, OCTET STRING
- ✅ Handle APPLICATION tags and context-specific tags
- ✅ Range and size constraints with MIN/MAX keywords
- ✅ OPTIONAL fields and extensibility markers
- ✅ ASN.1 comment preservation as inline documentation
- ✅ Proprietary range detection for extensible enumerations
- ✅ Production-ready with comprehensive error handling and line-number tracking

## Installation

```bash
npm install
```

## Usage

### Parse and Normalize ASN.1 Content

```javascript
import { parse, normalize, ParserError } from './src/index.js';

const asn1 = `TriState ::= ENUMERATED {
    off (0),
    on (1),
    auto (2)
}`;

try {
    // Parse ASN.1 into raw definition objects
    const definitions = parse(asn1);
    console.log('Parsed:', definitions);
    
    // Normalize to BAClib format with predefined type checking
    const normalized = definitions.map(def => normalize(def));
    console.log('Normalized:', normalized);
} catch (error) {
    if (error instanceof ParserError) {
        console.error(`Parse error at line ${error.line}: ${error.message}`);
    }
}
```

### Parse ASN.1 File

```javascript
import { parse } from './src/index.js';
import fs from 'fs';

// Parse ASN.1 content
const asn1Content = fs.readFileSync('input.asn1', 'utf8');
const definitions = parse(asn1Content);

console.log(definitions);
```

## Project Structure

```
bacnet-asn1-parser/
├── src/
│   ├── index.js                  # Main parser and normalization engine
│   ├── to-baclib-name.js         # Name conversion utility (PascalCase -> kebab-case)
│   ├── generate-predefined.js    # Script to generate predefined type definitions
│   └── predefined-abstract.json  # Abstract specifications for predefined types
├── predefined/
│   ├── unsigned.json             # Predefined type definitions (auto-generated)
│   ├── integer.json
│   ├── bit-string.json
│   └── ...                       # 30+ predefined BACnet primitive types
└── README.md
```

## ASN.1 Support

Supported constructs:
- ✅ APPLICATION tags
- ✅ SEQUENCE types with ordered fields
- ✅ SEQUENCE OF and SEQUENCE SIZE OF
- ✅ OPTIONAL fields
- ✅ CHOICE types with alternative fields
- ✅ OCTET STRING
- ✅ ENUMERATED types with named values
- ✅ BIT STRING with named bits
- ✅ Type references
- ✅ Context-specific tags
- ✅ Range constraints (MIN..MAX)
- ✅ Size constraints
- ✅ Extensibility markers (...)

Example input:
```asn1
TriState ::= ENUMERATED {
    off (0),
    on (1),
    auto (2)
}

BACnetObjectIdentifier ::= [APPLICATION 12] OCTETSTRING (SIZE(4))
```

## Output Formats

### Parsed Format (Raw ASN.1 Structure)

The `parse()` function returns ASN.1 definitions in their raw parsed form:

```javascript
[
    {
        name: 'TriState',
        type: 'Enumerated',
        items: [
            { name: 'off', number: 0 },
            { name: 'on', number: 1 },
            { name: 'auto', number: 2 }
        ]
    }
]
```

### Normalized Format (BAClib-Compliant)

The `normalize()` function converts to BAClib kebab-case format with enhanced metadata:

```javascript
[
  {
    name: 'tri-state',
    type: {
      base: 'enumerated',
      values: [
        { name: 'off', constant: 0 },
        { name: 'on', constant: 1 },
        { name: 'auto', constant: 2 }
      ]
    }
  }
]
```

### Predefined Types

Predefined types are automatically recognized and returned from the predefined library:

```javascript
import { normalize, predefinedTypes } from './src/index.js';

// Access predefined types directly
const unsigned8 = predefinedTypes.get('Unsigned8');
// Returns: { alias: 'Unsigned8', name: 'unsigned-8', type: 'unsigned', minimum: 0, maximum: 255 }

// Or by normalized name
const real = predefinedTypes.get('real');
// Returns: { name: 'real', primitive: 4, minimum: -3.4e38, maximum: 3.4e38 }
```

## API Reference

### parse(content)
Parse ASN.1 content string into raw definition objects.

**Parameters:**
- `content` (string): ASN.1 notation to parse

**Returns:** Array of definition objects with original ASN.1 names and structure

**Throws:** `ParserError` if parsing fails (includes line number)

**Example:**
```javascript
const definitions = parse('Unsigned ::= Unsigned (0..255)');
// Returns: [{ name: 'Unsigned', type: 'Unsigned', range: { min: 0, max: 255 } }]
```

### normalize(definition)
Normalize a parsed definition into BAClib-compliant format.

Checks against predefined types first; if found, returns the predefined version.
Otherwise, normalizes the definition by:
- Converting names to kebab-case
- Structuring types with base and traits
- Adding proprietary range information for extensible types
- Sorting enumeration values by constant number

**Parameters:**
- `definition` (object): A single parsed definition object

**Returns:** Normalized definition with kebab-case names and structured types

**Example:**
```javascript
const parsed = parse('Unsigned8 ::= Unsigned (0..255)')[0];
const normalized = normalize(parsed);
// Returns: { name: 'unsigned-8', type: { base: 'unsigned', minimum: 0, maximum: 255 } }
```

### predefinedTypes
Map containing all predefined BACnet/BAClib type definitions.

Types can be accessed by either their original name (e.g., 'Unsigned8') or
normalized name (e.g., 'unsigned-8').

**Type:** `Map<string|number, Object>`

**Example:**
```javascript
import { predefinedTypes } from './src/index.js';

// Access by original name
const uint8 = predefinedTypes.get('Unsigned8');

// Access by normalized name  
const boolean = predefinedTypes.get('boolean');

// Check if type is predefined
if (predefinedTypes.has('Real')) {
  console.log('Real is a predefined type');
}
```

### toBaclibName(string, prefix)
Convert BACnet names to BAClib kebab-case format.

**Parameters:**
- `string` (string): The name to convert
- `prefix` (boolean|string|number): Controls "BACnet" prefix handling
  - `false`: Remove "BACnet" prefix
  - `true`: Replace with "0-"
  - `string`: Replace with custom prefix
  - `undefined`: Keep as "bacnet"

**Returns:** Kebab-case name string

**Example:**
```javascript
import { toBaclibName } from './src/to-baclib-name.js';

toBaclibName('BACnetPropertyReference', false);  // 'property-reference'
toBaclibName('Unsigned16');                      // 'unsigned-16'
toBaclibName('HTTPResponse');                    // 'http-response'
```

### generatePredefined()
Generate normalized predefined type definitions from abstract specifications.

This function is used by the `generate-predefined.js` script to create the
predefined type JSON files. It reads from `predefined-abstract.json` and
transforms abstract type specs into normalized definitions.

**Returns:** Array of normalized predefined type definitions

**Example:**
```javascript
import { generatePredefined } from './src/generate-predefined.js';

const types = generatePredefined();
// Returns array of all predefined types with normalized names and constraints
```

### ParserError
Custom error class for ASN.1 parsing errors with line number tracking.

**Properties:**
- `message` (string): Error description
- `name` (string): Always 'ParserError'
- `line` (number): Line number where error occurred (1-indexed)

**Example:**
```javascript
try {
  parse('Invalid ::= SOMETHING');
} catch (error) {
  if (error instanceof ParserError) {
    console.error(`Error at line ${error.line}: ${error.message}`);
  }
}
```

## Use Cases

1. **BACnet Protocol Development**: Parse and normalize standard ASN.1 definitions into structured, consistent format
2. **Code Generation**: Use normalized definitions to generate type-safe code in TypeScript, C++, Python, etc.
3. **Protocol Analysis**: Extract metadata including proprietary ranges, constraints, and documentation from ASN.1
4. **API Documentation**: Generate comprehensive API docs from ASN.1 specifications with preserved comments
5. **Validation Tools**: Build validators using parsed range constraints and type information
6. **Schema Conversion**: Transform BACnet ASN.1 to JSON Schema, OpenAPI, or other schema formats
7. **Type Libraries**: Build runtime type libraries with kebab-case naming for modern frameworks

## License

Copyright 2024-2026, The BAClib Initiative and Contributors

All project files are provided under the terms of the [Eclipse Public License - v 2.0](https://www.eclipse.org/legal/epl-2.0/).

Additionally the corresponding [SPDX Identifier `EPL-2.0`](https://spdx.org/licenses/EPL-2.0.html) is placed in all relevant files to clearly indicate the project license.

> [!NOTE]
> The Eclipse Public License 2.0 (EPL-2.0) is a business-friendly open source license. It allows integration into commercial software without requiring disclosure of proprietary material.
