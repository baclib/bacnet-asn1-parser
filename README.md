# BACnet ASN.1 Parser

A lightweight Node.js parser for ASN.1 notation of BACnet data types.

## Features

- ✅ Parse ASN.1 definitions of BACnet data types
- ✅ Support for ENUMERATED, SEQUENCE, CHOICE, BIT STRING, OCTET STRING
- ✅ Handle APPLICATION tags and context-specific tags
- ✅ Range and size constraints
- ✅ OPTIONAL fields and extensibility markers
- ✅ Production-ready with comprehensive error handling

## Installation

```bash
npm install
```

## Usage

### Parse ASN.1 Content

```javascript
import { parse, ParserError } from './src/index.js';

const asn1 = `
BAClibTriState ::= ENUMERATED {
    off (0),
    on (1),
    auto (2)
}
`;

try {
    const definitions = parse(asn1);
    console.log(definitions);
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
│   └── index.js           # ASN.1 parser implementation
├── tests/
│   ├── invalid-data/      # Invalid ASN.1 test files
│   ├── valid-data/        # Valid ASN.1 test files
│   └── test-suite.js      # Comprehensive test suite
└── README.md
```

## ASN.1 Support

Supported constructs:
- ✅ ENUMERATED types with named values
- ✅ SEQUENCE types with ordered fields
- ✅ CHOICE types with alternative fields
- ✅ BIT STRING with named bits
- ✅ OCTET STRING
- ✅ Type references
- ✅ SEQUENCE OF and SEQUENCE SIZE OF
- ✅ APPLICATION tags
- ✅ Context-specific tags
- ✅ Range constraints (MIN..MAX)
- ✅ Size constraints
- ✅ OPTIONAL fields
- ✅ Extensibility markers (...)

Example input:
```asn1
BAClibTriState ::= ENUMERATED {
    off (0),
    on (1),
    auto (2)
}

BACnetObjectIdentifier ::= [APPLICATION 12] SEQUENCE {
    object-type [0] BACnetObjectType,
    instance-number [1] Unsigned (0..4194303)
}
```

## Output Format

The parser returns an array of definition objects:

```javascript
[
  {
    name: 'BAClibTriState',
    type: 'Enumerated',
    items: [
      { name: 'off', number: 0 },
      { name: 'on', number: 1 },
      { name: 'auto', number: 2 }
    ]
  },
  {
    name: 'BACnetObjectIdentifier',
    primitive: 12,
    type: 'SEQUENCE',
    items: [
      { name: 'object-type', number: 0, type: 'BACnetObjectType' },
      { 
        name: 'instance-number', 
        number: 1, 
        type: 'Unsigned',
        range: { min: 0, max: 4194303 }
      }
    ]
  }
]
```

## API Reference

### parse(content)
Parse ASN.1 content string and return definitions.

**Parameters:**
- `content` (string): ASN.1 notation to parse

**Returns:** Array of definition objects

**Throws:** `ParserError` if parsing fails

### ParserError
Custom error class for parsing errors.

**Properties:**
- `message`: Error description
- `name`: 'ParserError'
- `line`: Line number where error occurred

## Testing

Run the comprehensive test suite:

```bash
npm test
```

The test suite includes:
- 26 valid ASN.1 test cases
- 19 invalid ASN.1 test cases
- Detailed HTML test report generation

## Use Cases

1. **BACnet Protocol Development**: Parse standard ASN.1 definitions into structured format
2. **Code Generation**: Use parsed definitions to generate code in various languages
3. **Protocol Analysis**: Extract and analyze BACnet type definitions
4. **Documentation**: Generate documentation from ASN.1 specifications
5. **Validation**: Verify ASN.1 syntax correctness

## License

Copyright 2024-2025, The BAClib Initiative and Contributors

All project files are provided under the terms of the [Eclipse Public License - v 2.0](https://www.eclipse.org/legal/epl-2.0/).

Additionally the corresponding [SPDX Identifier `EPL-2.0`](https://spdx.org/licenses/EPL-2.0.html) is placed in all relevant files to clearly indicate the project license.

> [!NOTE]
> The Eclipse Public License 2.0 (EPL-2.0) is a business-friendly open source license. It allows integration into commercial software without requiring disclosure of proprietary material.
