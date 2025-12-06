// SPDX-FileCopyrightText: Copyright 2024-2025, The BAClib Initiative and Contributors
// SPDX-License-Identifier: EPL-2.0

import fs from 'node:fs/promises';
import { toAlias } from './to-alias.js';

// ============================================================================
// PREDEFINED TYPES LOADER
// ============================================================================

/**
 * Loads all predefined BACnet/BAClib type definitions from JSON files.
 *
 * Scans the '../predefined' directory and loads each JSON file containing
 * type definitions. Each type is indexed in a Map by both its 'id' and 'name'
 * properties for efficient lookup during normalization.
 *
 * This enables the parser to recognize and use predefined BACnet/BAClib types
 * without requiring them to be redefined in the ASN.1 content being parsed.
 *
 * @type {Map<string|number, Object>}
 */
const predefinedPath = new URL('../predefined/', import.meta.url);
const predefinedFiles = await fs.readdir(predefinedPath);
const predefinedTypes = new Map();

for (const file of predefinedFiles) {
    if (file.endsWith('.json')) {
        const filePath = new URL(file, predefinedPath);
        const content = await fs.readFile(filePath, 'utf8');
        const type = JSON.parse(content);
        predefinedTypes.set(type.id, type);
        predefinedTypes.set(type.name, type);
    }
}

// ============================================================================
// PARSER ERROR CLASS
// ============================================================================

/**
 * Custom error class for BACnet ASN.1 parsing errors.
 *
 * Extends the built-in Error class to provide additional context when an error
 * occurs during BACnet ASN.1 parsing. Automatically calculates the line number
 * where the error occurred for better debugging and error reporting.
 *
 * @class ParserError
 * @extends {Error}
 * @param {string} message - The error message describing the parsing issue
 * @param {string} content - The BACnet ASN.1 content being parsed
 * @param {number} index - The character index in the content where the error occurred
 *
 * @property {string} name - The name of the error class
 * @property {number} line - The line number in the BACnet ASN.1 content where the error occurred
 */
class ParserError extends Error {
    constructor(message, content, index) {
        super(message);
        this.name = this.constructor.name;
        
        // Calculate line number by counting newlines up to error position
        this.line = 1 + content.slice(0, index).split('\n').length - 1;
    }
}

// ============================================================================
// BACnet ASN.1 PARSER
// ============================================================================

/**
 * Parses BACnet ASN.1 content and returns an array of definition objects.
 *
 * This function processes a string containing BACnet ASN.1 definitions, validates
 * the input, normalizes line endings, and parses each definition into a structured
 * JavaScript object. Supports parsing of types, ranges, sequences, enumerations,
 * and complex nested structures.
 *
 * The parser handles:
 * - Type definitions with optional APPLICATION tags
 * - SEQUENCE and CHOICE types with nested items
 * - ENUMERATED and BIT STRING types
 * - Range and size constraints (including MIN/MAX keywords)
 * - Optional fields and extensibility markers
 * - ASN.1 comments (-- style)
 *
 * @param {string} content - The BACnet ASN.1 content to parse
 * @returns {Array<Object>} Array of parsed ASN.1 definition objects
 *
 * @throws {TypeError} If the input is not a string
 * @throws {ParserError} If invalid characters are found or syntax errors are detected
 */
function parse(content) {
    // Validate input type
    if (typeof content !== 'string') {
        throw new TypeError(`Expected string, got ${typeof content}`);
    }

    // Normalize line endings to Unix format (\n)
    content = content.replaceAll(/\r\n|\r/g, '\n');
    let text = content;

    // Validate that content contains only ASCII printable characters, tabs, and newlines
    const invalidCharIndex = content.search(/[^\t\n\x20-\x7E]/);
    if (invalidCharIndex >= 0) {
        throw new ParserError('Invalid characters in content', content, invalidCharIndex);
    }

    // Track current position in original content for error reporting
    let currentIndex = 0;
    let lastSkippedText = '';

    /**
     * Advances to the next parsable character by skipping whitespace and comments.
     *
     * ASN.1 comments start with -- and continue to the end of the line.
     * Extracts comment text for potential use as documentation.
     *
     * @returns {boolean} True if more content remains to parse, false otherwise
     */
    function skipWhitespaceAndComments() {
        const originalLength = text.length;
        text = text.replace(/^(\s|--.*)+/, '');
        const skippedLength = originalLength - text.length;
        
        // Extract and normalize comment text
        lastSkippedText = content
            .substring(currentIndex, currentIndex + skippedLength)
            .replace(/--/g, '')
            .trim()
            .replace(/[\n\s]+/g, ' ');
        
        currentIndex = content.length - text.length;
        return text.length > 0;
    }

    /**
     * Attempts to match a pattern at the current position.
     *
     * If successful, consumes the matched text and advances to the next token.
     * Optionally transforms the match result using a provided function or string.
     *
     * @param {string|RegExp} pattern - The pattern to match (string literal or regex)
     * @param {string|Function} [transform] - Optional transform for the matched value
     * @returns {*} Match result if successful, false/undefined otherwise
     */
    function tryMatch(pattern, transform) {
        const isString = typeof pattern === 'string';
        let match = isString ? text.startsWith(pattern) : text.match(pattern);

        if (!match) {
            return match;
        }

        // Consume matched text and skip following whitespace/comments
        const matchLength = isString ? pattern.length : match[0].length;
        text = text.substring(matchLength);
        skipWhitespaceAndComments();

        // Apply transform if provided
        if (transform) {
            match = typeof transform === 'string' ? transform : transform(match);
        }

        return match;
    }

    /**
     * Matches a required pattern or throws a ParserError if not found.
     *
     * @param {string|RegExp} pattern - The pattern that must match
     * @returns {*} The match result
     * @throws {ParserError} If the pattern does not match
     */
    function requireMatch(pattern) {
        const match = tryMatch(pattern);
        if (!match) {
            throw new ParserError(`Expected pattern ${pattern} not found`, content, currentIndex);
        }
        return match;
    }

    /**
     * Parses a complete BACnet ASN.1 type definition.
     *
     * Format: TypeName ::= [APPLICATION tag] TypeExpression
     * Type names must start with uppercase and follow PascalCase with hyphens.
     *
     * @param {Object} definition - The definition object to populate
     */
    function parseDefinition(definition) {
        // Parse type name (PascalCase with optional hyphens)
        definition.name = requireMatch(/^([A-Z][0-9A-Za-z]*(?:-[A-Z][0-9A-Za-z]*)*)\s*::=/)[1];

        // Parse optional APPLICATION tag
        tryMatch(/^\[\s*APPLICATION\s+(\d+)\s*\]/, match => {
            definition.primitive = parseInt(match[1], 10);
        });

        parseType(definition);
    }

    /**
     * Parses a type expression (the right-hand side of a definition).
     *
     * Handles SEQUENCE OF, base types, constraints, and items.
     * Recognizes built-in types (ENUMERATED, BIT STRING, OCTET STRING) and
     * user-defined types.
     *
     * @param {Object} item - The item object to populate with type information
     */
    function parseType(item) {
        // Check for SEQUENCE OF or SEQUENCE SIZE(n) OF
        tryMatch(/^SEQUENCE\s*(?:SIZE\s*\(\s*(\d+)\s*\)\s*)?OF/, match => {
            item.series = match[1] ? parseInt(match[1], 10) : true;
        });

        // Determine base type (built-in or user-defined)
        item.type = tryMatch('ABSTRACT-SYNTAX.&Type', 'Any')
            || tryMatch('ENUMERATED', 'Enumerated')
            || tryMatch(/^BIT\s+STRING/, 'BitString')
            || tryMatch(/^OCTET\s+STRING/, 'OctetString')
            || requireMatch(/^[A-Z][0-9A-Za-z]*(?:-[A-Z][0-9A-Za-z]*)*/)[0];

        // Parse SIZE constraint if present
        tryMatch(/^\(?\s*SIZE/, match => {
            parseRangeConstraint(item, true);
            if (match[0].startsWith('(')) {
                requireMatch(')');
            }
        });

        // Parse value range constraint
        parseRangeConstraint(item, false);

        // Parse items (for ENUMERATED, BIT STRING, SEQUENCE, CHOICE)
        parseItems(item);
    }

    /**
     * Parses a range constraint in the form (min..max) or (value).
     *
     * Supports MIN/MAX keywords for unbounded ranges. Validates that minimum
     * is not greater than maximum.
     *
     * @param {Object} item - The item object to add the constraint to
     * @param {boolean} isSize - True if this is a SIZE constraint, false for value range
     */
    function parseRangeConstraint(item, isSize) {
        const rangePattern = /^\(\s*(MIN|[+-]?\d+(?:\.\d+)?)\s*(?:\.\.\s*(MAX|[+-]?\d+(?:\.\d+)?)\s*)?\)/;
        const match = isSize ? requireMatch(rangePattern) : tryMatch(rangePattern);

        if (!match) {
            return;
        }

        const minValue = match[1] === 'MIN' ? Number.NEGATIVE_INFINITY : parseFloat(match[1]);
        const maxValue = match[2]
            ? (match[2] === 'MAX' ? Number.POSITIVE_INFINITY : parseFloat(match[2]))
            : minValue;

        if (minValue > maxValue) {
            throw new ParserError(
                `Invalid range: minimum (${minValue}) is greater than maximum (${maxValue})`,
                content,
                currentIndex
            );
        }

        item[isSize ? 'size' : 'range'] = { min: minValue, max: maxValue };
    }

    /**
     * Parses items within braces for ENUMERATED, BIT STRING, SEQUENCE, or CHOICE types.
     *
     * Simple types (BitString, Enumerated): name (number)
     * Complex types (SEQUENCE, CHOICE): name [tag] Type OPTIONAL
     *
     * Handles extensibility markers (...) for all types except SEQUENCE.
     * Preserves comments from ASN.1 source as documentation.
     *
     * @param {Object} definition - The definition object to add items to
     */
    function parseItems(definition) {
        if (!tryMatch('{')) {
            return;
        }

        const isSimpleType = ['BitString', 'Enumerated'].includes(definition.type);
        const isComplexType = ['CHOICE', 'SEQUENCE'].includes(definition.type);

        if (!isSimpleType && !isComplexType) {
            throw new ParserError(
                `Type '${definition.type}' cannot have items`,
                content,
                currentIndex
            );
        }

        definition.items = [];

        while (skipWhitespaceAndComments()) {
            // Parse item name (kebab-case, starts with lowercase)
            const itemName = requireMatch(/^[a-z][0-9a-z]*(?:-[0-9a-z]+)*/)[0];
            const item = { name: itemName };

            if (isSimpleType) {
                // Simple types: name (number)
                item.number = parseInt(requireMatch(/^\(\s*(\d+)\s*\)/)[1], 10);
            } else {
                // Complex types: name [tag] Type OPTIONAL
                const tagMatch = tryMatch(/^\[(\d+)\]/);
                if (tagMatch) {
                    item.number = parseInt(tagMatch[1], 10);
                }

                parseType(item);

                if (tryMatch('OPTIONAL')) {
                    item.optional = true;
                }
            }

            // Preserve comments as documentation
            if (lastSkippedText) {
                item.comment = lastSkippedText;
            }

            definition.items.push(item);

            // Check for continuation or extensibility marker
            if (tryMatch(',')) {
                if (lastSkippedText) {
                    item.comment = lastSkippedText;
                }

                // Extensibility marker (...) allowed for all types except SEQUENCE
                if (definition.type !== 'SEQUENCE' && tryMatch('...')) {
                    definition.extensible = true;
                    break;
                }
                continue;
            }

            break;
        }

        requireMatch('}');
        
        // Preserve closing comment as definition documentation
        if (lastSkippedText) {
            definition.comment = lastSkippedText;
        }
    }

    // Parse all definitions in the content
    const definitions = [];
    while (skipWhitespaceAndComments()) {
        const definition = {};
        parseDefinition(definition);
        definitions.push(definition);
    }

    return definitions;
}

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Validates and returns a context tag number if valid, otherwise null.
 *
 * Context tags in BACnet ASN.1 are used to distinguish alternatives in CHOICE
 * types and to tag fields in SEQUENCE types. Valid range is [0, 254].
 *
 * @param {*} value - The value to validate as a context number
 * @returns {number|null} The validated context number or null if invalid
 */
function getContextNumber(value) {
    return Number.isInteger(value) && value >= 0 && value < 255 ? value : null;
}

/**
 * Creates a type reference for definitions that reference another type without constraints.
 *
 * Type references are used when a definition simply refers to another type
 * without adding any additional constraints or structure.
 *
 * @param {Object} definition - The definition object containing type information
 * @returns {Object} A normalized type reference with alias set to null
 */
function getTypeReference(definition) {
    return enrichDefinition(definition, { alias: null, name: definition.type, base: null });
}

/**
 * Enriches a definition object with standard properties and type-specific traits.
 *
 * Determines if the definition is anonymous (lowercase name) or named (uppercase name).
 * Anonymous definitions are typically nested types within SEQUENCE or CHOICE structures.
 * Named definitions become reusable types with generated aliases for programmatic use.
 *
 * @param {Object} definition - The base definition object
 * @param {Object} traits - Additional type-specific properties to merge
 * @returns {Object} The enriched definition with alias, name, base, series, and traits
 */
function enrichDefinition(definition, traits) {
    const isNamed = /^[A-Z]/.test(definition.name);
    return {
        alias: isNamed ? toAlias(definition.name, definition.vendor) : null,
        name: isNamed ? definition.name : null,
        base: toAlias(definition.type),
        series: !!definition.series,
        ...traits
    };
}

/**
 * Normalizes numeric type definitions (Unsigned, Integer, Real, Double).
 *
 * Converts range constraints to a normalized format:
 * - Single value ranges (min === max) become a single number
 * - Multi-value ranges become {minimum, maximum} objects
 *
 * @param {Object} definition - The numeric type definition
 * @returns {Object} Normalized definition with range constraint or type reference
 */
function normalizeNumber(definition) {
    if (!definition.range) {
        return getTypeReference(definition);
    }

    return enrichDefinition(definition, {
        range: definition.range.min === definition.range.max
            ? definition.range.min
            : { minimum: definition.range.min, maximum: definition.range.max }
    });
}

/**
 * Normalizes string type definitions (OctetString, CharacterString).
 *
 * Converts size constraints to a normalized length format:
 * - Fixed size (min === max) becomes a single number
 * - Variable size becomes {minimum, maximum} object
 *
 * @param {Object} definition - The string type definition
 * @returns {Object} Normalized definition with length constraint or type reference
 */
function normalizeString(definition) {
    if (!definition.size) {
        return getTypeReference(definition);
    }

    return enrichDefinition(definition, {
        length: definition.size.min === definition.size.max
            ? definition.size.min
            : { minimum: definition.size.min, maximum: definition.size.max }
    });
}

/**
 * Normalizes BIT STRING type definitions.
 *
 * Converts named bit definitions into a structured format with aliases and indices.
 * Calculates the minimum bit string length based on the highest bit index.
 * Handles special cases for known BACnet bit string types with custom ranges.
 *
 * Special handling for:
 * - BACnetAuditOperationFlags: 64-bit with standard/custom ranges
 * - BACnetObjectTypesSupported: Variable length 18-1024 bits
 * - BACnetServicesSupported: Variable length 35-512 bits
 *
 * @param {Object} definition - The BIT STRING type definition
 * @returns {Object} Normalized definition with bits array or type reference
 */
function normalizeBitString(definition) {
    if (!definition.items?.length) {
        return getTypeReference(definition);
    }

    // Calculate minimum length based on highest bit index
    const calculatedLength = Math.max(...definition.items.map(item => item.number)) + 1;

    const traits = {
        bits: definition.items.map(({ number, name }) => ({
            alias: toAlias(name),
            name,
            index: number
        })),
        extensible: !!definition.extensible,
        length: calculatedLength
    };

    // Handle length and ranges for known BACnet bit string types
    switch (definition.name) {
        case 'BACnetAuditOperationFlags':
            traits.length = { minimum: calculatedLength, maximum: 64 };
            traits.ranges = [
                { custom: false, from: 0, to: 31 },
                { custom: true, from: 32, to: 63 }
            ];
            break;

        case 'BACnetObjectTypesSupported':
            traits.length = { minimum: 18, maximum: 1024 };
            traits.ranges = [
                { custom: false, from: 0, to: 127 },
                { custom: true, from: 128, to: 1023 }
            ];
            break;

        case 'BACnetServicesSupported':
            traits.length = { minimum: 35, maximum: 512 };
            break;
    }

    return enrichDefinition(definition, traits);
}

/**
 * Normalizes ENUMERATED type definitions.
 *
 * Converts enumeration values into a structured format with aliases and values.
 * Calculates the valid range based on minimum and maximum enumeration values.
 * Handles special cases for known BACnet enumerated types with custom/reserved ranges.
 *
 * Special handling for:
 * - BACnetEngineeringUnits: Standard/custom value ranges
 * - BACnetPropertyIdentifier: Standard/custom value ranges
 * - Types with comment-based range documentation
 *
 * @param {Object} definition - The ENUMERATED type definition
 * @returns {Object} Normalized definition with items array or type reference
 */
function normalizeEnumerated(definition) {
    if (!definition.items?.length) {
        return getTypeReference(definition);
    }

    // Calculate range based on enumeration values
    const numbers = definition.items.map(item => item.number);
    const minValue = Math.min(...numbers);
    const maxValue = Math.max(...numbers) + 1;

    const traits = {
        items: definition.items.map(({ name, number }) => ({
            alias: toAlias(name),
            name,
            value: number
        })),
        extensible: !!definition.extensible,
        range: { minimum: minValue, maximum: maxValue }
    };

    // Handle constraints for known BACnet enumerated types
    switch (definition.name) {
        case 'BACnetEngineeringUnits':
            traits.range.minimum = 0;
            traits.range.maximum = 65535;
            traits.ranges = [
                { custom: false, from: 0, to: 255 },
                { custom: false, from: 47808, to: 49999 },
                { custom: true, from: 256, to: 47807 },
                { custom: true, from: 50000, to: 65535 }
            ];
            break;

        case 'BACnetPropertyIdentifier':
            traits.range.minimum = 0;
            traits.range.maximum = 4294967295;
            traits.ranges = [
                { custom: false, from: 0, to: 511 },
                { custom: true, from: 512, to: 4194303 },
                { custom: false, from: 4194304, to: 4294967295 }
            ];
            break;

        default:
            // Extract reserved/custom ranges from comment if available
            if (!definition.extensible && definition.comment) {
                const regex = /^Enumerated values (\d+)-(\d+) are reserved for definition by ASHRAE\. Enumerated values (\d+)-(\d+) may be used by others/;
                const match = definition.comment.match(regex);

                if (match) {
                    traits.range.minimum = parseInt(match[1], 10);
                    traits.range.maximum = parseInt(match[4], 10) + 1;
                    traits.ranges = [
                        {
                            custom: false,
                            from: traits.range.minimum,
                            to: parseInt(match[2], 10)
                        },
                        {
                            custom: true,
                            from: parseInt(match[3], 10),
                            to: parseInt(match[4], 10)
                        }
                    ];
                }
            }
            break;
    }

    return enrichDefinition(definition, traits);
}

/**
 * Normalizes CHOICE type definitions.
 *
 * Converts choice alternatives into a structured format with:
 * - Aliases for each option (kebab-case)
 * - Recursively normalized types for each option
 * - Context tag numbers for BACnet encoding
 * - Extensibility marker if present
 *
 * @param {Object} definition - The CHOICE type definition
 * @returns {Object} Normalized definition with options array
 */
function normalizeChoice(definition) {
    return enrichDefinition(definition, {
        options: (definition.items || []).map(item => ({
            alias: toAlias(item.name),
            name: item.name,
            type: normalizeDefinition(item),
            context: getContextNumber(item.number)
        })),
        extensible: !!definition.extensible
    });
}

/**
 * Normalizes SEQUENCE type definitions.
 *
 * Converts sequence fields into a structured format with:
 * - Aliases for each field (kebab-case)
 * - Recursively normalized types for each field
 * - Context tag numbers for BACnet encoding
 * - Optional flags to indicate non-required fields
 *
 * @param {Object} definition - The SEQUENCE type definition
 * @returns {Object} Normalized definition with fields array
 */
function normalizeSequence(definition) {
    return enrichDefinition(definition, {
        fields: (definition.items || []).map(item => ({
            alias: toAlias(item.name),
            name: item.name,
            type: normalizeDefinition(item),
            context: getContextNumber(item.number),
            optional: !!item.optional
        }))
    });
}

/**
 * Normalizes a parsed BACnet/BAClib ASN.1 definition into a structured format.
 *
 * Routes the definition to the appropriate type-specific normalizer based on
 * the definition's type property. Supports numeric types, strings, bit strings,
 * enumerations, choices, and sequences.
 *
 * This is the main entry point for normalizing parsed definitions into a
 * consistent, structured format suitable for code generation or analysis.
 *
 * @param {Object} definition - The parsed BACnet/BAClib ASN.1 definition to normalize
 * @returns {Object} The normalized definition with consistent structure
 */
function normalizeDefinition(definition) {
    switch (definition.type) {
        case 'Unsigned':
        case 'Integer':
        case 'Real':
        case 'Double':
            return normalizeNumber(definition);
        case 'OctetString':
        case 'CharacterString':
            return normalizeString(definition);
        case 'BitString':
            return normalizeBitString(definition);
        case 'Enumerated':
            return normalizeEnumerated(definition);
        case 'CHOICE':
            return normalizeChoice(definition);
        case 'SEQUENCE':
            return normalizeSequence(definition);
        default:
            return getTypeReference(definition);
    }
}

/**
 * Normalizes a top-level BACnet/BAClib ASN.1 definition, checking for predefined types first.
 *
 * This is the main normalization function for processing parsed definitions.
 * Checks if the definition matches a predefined type (loaded from JSON files).
 * If found, returns the predefined version; otherwise, normalizes using the
 * standard normalization process.
 *
 * This two-tier approach allows predefined types to override parsed definitions,
 * ensuring consistency with BACnet standard library types.
 *
 * @param {Object} definition - The parsed, top-level BACnet/BAClib ASN.1 definition
 * @returns {Object} The predefined type or normalized definition
 */
function normalize(definition) {
    return predefinedTypes.get(definition.name) || normalizeDefinition(definition);
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * @module bacnet-asn1-parser
 * @description Parses and normalizes BACnet ASN.1 definitions.
 *
 * This module provides comprehensive functionality for parsing BACnet ASN.1
 * definitions from text format into structured JavaScript objects. It includes:
 *
 * - ParserError: Custom error class with line number tracking
 * - parse: Function to parse ASN.1 content into definition objects
 * - normalize: Function to normalize definitions with predefined type support
 * - predefinedTypes: Map of predefined BACnet types loaded from JSON files
 *
 * The parser supports the full range of BACnet ASN.1 constructs including
 * primitive types, sequences, choices, enumerations, bit strings, constraints,
 * and extensibility markers.
 */
export {
    normalize,
    ParserError,
    parse,
    predefinedTypes
};
