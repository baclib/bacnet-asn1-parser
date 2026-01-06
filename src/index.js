// SPDX-FileCopyrightText: Copyright 2024-2026, The BAClib Initiative and Contributors
// SPDX-License-Identifier: EPL-2.0

import fs from 'node:fs/promises';
import { toBaclibName } from './to-baclib-name.js';

// ============================================================================
// PREDEFINED TYPES LOADER
// ============================================================================

/**
 * Loads all predefined BACnet/BAClib type definitions from JSON files.
 *
 * Scans the '../predefined' directory and loads each JSON file containing
 * type definitions. Each type is indexed in a Map by both its 'alias' and
 * 'name' properties for efficient lookup during normalization.
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
        predefinedTypes.set(type.alias, type);
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
    let lastComment = '';
    
    /**
     * Advances to the next parsable character by skipping whitespace and comments.
     *
     * ASN.1 comments start with -- and continue to the end of the line.
     * Extracts comment text for potential use as documentation.
     *
     * @returns {boolean} True if more content remains to parse, false otherwise
     */
    function skipWhitespaceAndComments() {
        lastComment = '';
        text = text.replace(/^(\s|--.*)+/, match => {
            lastComment = match.replace(/--/g, '').replace(/[\t ]+/g, ' ').trim();
            return '';
        });
        currentIndex = content.length - text.length;
        return text.length > 0;
    }

    /**
     * Attempts to match a pattern at the current position in the text.
     *
     * This is the core matching function used throughout the parser. It handles both
     * string literals and regular expressions, automatically consuming matched text
     * and advancing past any following whitespace or comments.
     *
     * When a match is successful:
     * 1. The matched text is consumed from the input
     * 2. Following whitespace/comments are skipped
     * 3. An optional transform is applied to the match result
     * 4. The (possibly transformed) match is returned
     *
     * @param {string|RegExp} pattern - The pattern to match
     *        - String: Checks if text starts with this exact string
     *        - RegExp: Must be anchored with ^ to match from start of text
     * @param {string|Function} [transform] - Optional transform for the matched value
     *        - String: Replace match with this literal value
     *        - Function: Called with match object, returns transformed value
     * @returns {*} The match result (possibly transformed) if successful, false/undefined if no match
     *
     * @example
     * // Match literal string
     * tryMatch('SEQUENCE')  // Returns true if text starts with 'SEQUENCE'
     *
     * @example
     * // Match regex and transform to constant
     * tryMatch(/^BIT\s+STRING/, 'BitString')  // Returns 'BitString' if matched
     *
     * @example
     * // Match regex and extract capture group
     * tryMatch(/^\[APPLICATION\s+(\d+)\]/, match => parseInt(match[1], 10))
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

        // Apply transform if provided (either replace with string or call function)
        if (transform) {
            match = typeof transform === 'string' ? transform : transform(match);
        }

        return match;
    }

    /**
     * Matches a required pattern or throws a ParserError if not found.
     *
     * This is a strict version of tryMatch() that enforces that a pattern MUST match
     * at the current position. Use this for syntax elements that are mandatory according
     * to the ASN.1 grammar (e.g., type names, closing braces, required parentheses).
     *
     * @param {string|RegExp} pattern - The pattern that must match
     * @returns {*} The match result (never returns false/undefined)
     * @throws {ParserError} If the pattern does not match, includes line number for debugging
     *
     * @example
     * // Require a type name (will throw if not found)
     * const typeName = requireMatch('}');
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
            // Comment text comes from the last skipWhitespaceAndComments() call,
            // which captured any "-- comment" text after the item's definition
            if (lastComment) {
                item.comment = lastComment;
            }

            definition.items.push(item);

            // Check for continuation (comma) or extensibility marker ("...")
            if (tryMatch(',')) {
                // After comma is consumed, any new comment belongs to the NEXT item,
                // so don't reassign it to the current item here

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
        if (lastComment) {
            definition.comment = lastComment;
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
 * Normalizes an item's name into BAClib format, handling alias creation when needed.
 *
 * This function converts ASN.1 names (PascalCase or kebab-case) into standardized
 * BAClib names (kebab-case). If the conversion results in a different name, both
 * the original (as `alias`) and converted (as `name`) are preserved.
 *
 * Name Conversion Examples:
 * - "BACnetPropertyReference" → { alias: "BACnetPropertyReference", name: "property-reference" }
 * - "unsigned-8" → { name: "unsigned-8" } (no alias needed, already in kebab-case)
 * - "Unsigned16" → { alias: "Unsigned16", name: "unsigned-16" }
 *
 * @param {Object} definition - The definition object containing at minimum a `name` property
 * @param {string} definition.name - The original ASN.1 name to normalize
 * @param {boolean|string|number} [prefix] - Controls "BACnet" prefix handling (see toBaclibName)
 *        - false: Remove "BACnet" prefix (used for top-level types)
 *        - undefined: Keep "BACnet" as "bacnet" (used for nested items)
 * @returns {Object} Normalized item with `name` and optionally `alias`
 *        - { name: string }: When conversion doesn't change the name
 *        - { alias: string, name: string }: When conversion produces a different name
 * @throws {Error} If definition doesn't have a valid name string
 */
function normalizeItem(definition, prefix) {
    if (typeof definition?.name !== 'string') {
        throw new Error('Definition must have a name string.');
    }
    const alias = definition.name;
    const name = toBaclibName(alias, prefix);
    // Only include alias if it differs from the normalized name
    return alias === name ? { name } : { alias, name };
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
function normalizeDefinition(definition, level = 0) {

    // Normalize the item name; for top-level (level=0) remove "BACnet" prefix
    const result = normalizeItem(definition, level ? undefined : false);
    if (!definition?.type) {
        throw new Error('Definition must have a type.');
    }
    // Convert type name to kebab-case (e.g., "ENUMERATED" -> "enumerated")
    result.type = toBaclibName(definition.type, false);

    let itemsName;   // Property name for items array ('bits', 'values', 'options', or 'fields')
    let itemsNumber; // Property name for item number ('position' or 'constant')
    let traits = null;

    // Determine how to handle items based on the type
    switch (definition.type) {
        case 'Unsigned':
        case 'Integer':
        case 'Real':
        case 'Double':
            if (definition.range) {
                traits = { minimum: definition.range.min, maximum: definition.range.max };
            }
            break;
        case 'OctetString':
        case 'CharacterString':
            if (definition.size) {
                const minimum = definition.size.min;
                const maximum = definition.size.max;
                traits = { length: minimum === maximum ? maximum : { minimum, maximum } };
            }
            break;
        case 'BitString':
            itemsName = 'bits';
            itemsNumber = 'position';
            break;
        case 'Enumerated':
            itemsName = 'values';
            itemsNumber = 'constant';
            break;
        case 'CHOICE':
            itemsName = 'options';
            break;
        case 'SEQUENCE':
            itemsName = 'fields';
            break;
    }

    // Add series constraint for SEQUENCE OF types
    if (definition.series) {
        traits = { series: definition.series, ...traits };
    }

    if (definition.items?.length) {
        // For simple types (BitString/Enumerated), sort by number for consistent ordering
        // For complex types (SEQUENCE/CHOICE), preserve definition order
        const items = itemsNumber ? definition.items.slice().sort((a, b) => a.number - b.number) : definition.items;
        traits = {
            [itemsName]: items.map(item => {
                const element = normalizeItem(item);
                if (itemsNumber) {
                    // Simple types: just add the number (position/constant) and return
                    element[itemsNumber] = item.number;
                    return element;
                }
                // Complex types: recursively normalize the item's type
                element.type = normalizeDefinition(item, level + 1);

                // Add context tag if defined
                if (Number.isInteger(item.number) && item.number >= 0) {
                    element.context = item.number;
                }

                // Mark SEQUENCE fields as optional if specified
                if (definition.type === 'SEQUENCE' && item.optional) {
                    element.optional = true;
                }
                return element;
            })
        };
        // Apply special handling for known BACnet types
        enhanceKnownTypes(definition, traits);
    }

    if (traits) {
        result.type = { base: result.type, ...traits };
        return result;
    }
    return level ? result.type : result;

}

/**
 * Enhances known BACnet types with additional constraints and proprietary ranges.
 *
 * This function applies special handling for well-known BACnet types that have
 * characteristics not fully captured in their ASN.1 definitions. It adds:
 * - Extended value ranges beyond what's in the ASN.1
 * - Proprietary value ranges reserved for vendor-specific extensions
 * - Minimum bit/value lengths for bit strings and service flags
 *
 * The function modifies the `traits` object in place, adding or updating properties
 * like `maximum`, `length`, and `proprietary`.
 *
 * Special Cases Handled:
 * - **BACnetEngineeringUnits**: Extends to 65535, defines proprietary ranges
 * - **BACnetPropertyIdentifier**: Extends to 4294967295, defines proprietary range
 * - **BACnetAuditOperationFlags**: Sets length based on highest bit position + proprietary
 * - **BACnetObjectTypesSupported**: Sets minimum 18 bits, max 1024, proprietary range
 * - **BACnetServicesSupported**: Sets minimum 35 bits, max 512
 * - **Extensible Enumerations**: Parses standard comment to extract proprietary ranges
 *
 * @param {Object} definition - The parsed ASN.1 definition being normalized
 * @param {string} definition.name - The type name (e.g., "BACnetEngineeringUnits")
 * @param {boolean} definition.extensible - True if the type is marked as extensible (...)
 * @param {string} [definition.comment] - ASN.1 comment that may contain range information
 * @param {Array} [definition.items] - Array of enumeration items (for bit position calculation)
 * @param {Object} traits - The traits object to enhance (modified in place)
 * @returns {boolean} True if the type was recognized and enhanced, false otherwise
 */
function enhanceKnownTypes(definition, traits) {

    switch (definition.name) {

        case 'BACnetEngineeringUnits':
            traits.maximum = 65535;
            traits.proprietary = [
                { from: 256, to: 47807 },
                { from: 50000, to: 65535 }
            ];
            return true;
        case 'BACnetPropertyIdentifier':
            traits.maximum = 4294967295;
            traits.proprietary = { from: 512, to: 4194303 }
            return true;
        case 'BACnetAuditOperationFlags':
            traits.length = { minimum: Math.max(...definition.items.map(item => item.number)) + 1, maximum: 64 };
            traits.proprietary = { from: 32, to: 63 };
            return true;
        case 'BACnetObjectTypesSupported':
            traits.length = { minimum: 18, maximum: 1024 };
            traits.proprietary = { from: 128, to: 1023 }
            return true;
        case 'BACnetServicesSupported':
            traits.length = { minimum: 35, maximum: 512 };
            return true;
    }

    // If not extensible, no proprietary ranges to add
    if (!definition.extensible) {
        return false;
    }

    // Default (unknown) proprietary range (will be overridden if we can parse the comment)
    traits.proprietary = { from: 1, to: 0 };

    // For extensible enumerations, try to extract range information from standard comment
    if (definition.type === 'Enumerated') {

        // Standard BACnet comment format:
        // "Enumerated values 0-255 are reserved for definition by ASHRAE. Enumerated values 256-65535 may be used by others"
        const regex = /^Enumerated values (\d+)-(\d+) are reserved for definition by ASHRAE\. Enumerated values (\d+)-(\d+) may be used by others/;

        // Normalize whitespace in comment before matching
        const match = definition.comment?.replace(/\s+/g, ' ').match(regex);
        if (match) {

            // Extract: [1]=ASHRAE min, [2]=ASHRAE max, [3]=proprietary min, [4]=proprietary max
            const minimum = parseInt(match[1], 10);
            if (minimum !== 0) {
                traits.minimum = minimum;
            }

            // Maximum is one past the last proprietary value (for exclusive range checking)
            traits.maximum = parseInt(match[4], 10) + 1;

            // Proprietary range is from match[3] to match[4] inclusive
            traits.proprietary = { from: parseInt(match[3], 10), to: parseInt(match[4], 10) };
            return true;
        }
    }

    return false;
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
