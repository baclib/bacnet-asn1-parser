// SPDX-FileCopyrightText: Copyright 2024-2025 The BAClib Initiative and Contributors
// SPDX-License-Identifier: BSD-2-Clause

/**
 * Custom error class for ASN.1 parsing errors.
 * 
 * Extends the built-in Error class to provide additional context when an error
 * occurs during ASN.1 parsing. Includes the line number where the error was detected.
 * 
 * @class ParserError
 * @extends {Error}
 * @param {string} message - The error message describing the parsing issue
 * @param {string} content - The ASN.1 content being parsed
 * @param {number} index - The character index in the content where the error occurred
 * 
 * @property {string} name - The name of the error class
 * @property {number} line - The line number in the content where the error occurred
 */
class ParserError extends Error {
    constructor(message, content, index) {
        super(message)
        this.name = this.constructor.name
        this.line = 1

        // Calculate the line number by counting newlines up to the error position
        for (let i = 0; i < index; i++) {
            if (content.charAt(i) === '\n') {
                this.line++
            }
        }
    }
}

/**
 * Parses BACnet ASN.1 content and returns an array of definition objects.
 * 
 * This function processes a string containing BACnet ASN.1 definitions, normalizes
 * line endings, validates character encoding, and parses each definition into a
 * structured JavaScript object. Supports parsing of types, ranges, sequences,
 * enumerations, and complex nested structures.
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
        throw new TypeError(`Expected string, got ${typeof content}`)
    }

    // Normalize line endings to Unix format (\n)
    content = content.replaceAll(/\r\n|\r/g, '\n')
    let text = content

    // Validate that content contains only ASCII printable characters, tabs, and newlines
    const invalidCharIndex = content.search(/[^\t\n\x20-\x7E]/)
    if (invalidCharIndex >= 0) {
        throw new ParserError('Invalid characters in content', content, invalidCharIndex)
    }

    // Track current position in original content for error reporting
    let currentIndex = 0

    /**
     * Advances to the next parsable character by skipping whitespace and comments.
     * Updates the currentIndex to track position in the original content.
     * 
     * @returns {boolean} True if more content remains to parse, false otherwise
     */
    function skipWhitespaceAndComments() {
        text = text.replace(/^(\s|--.*)+/, '')
        currentIndex = content.length - text.length
        return text.length > 0
    }

    /**
     * Attempts to match a pattern at the current position.
     * If successful, consumes the matched text and advances to the next token.
     * 
     * @param {string|RegExp} pattern - The pattern to match (string literal or regex)
     * @param {string|Function} [transform] - Optional transform for the matched value
     * @returns {*} Match result if successful, false/undefined otherwise
     */
    function tryMatch(pattern, transform) {
        const isStringPattern = typeof pattern === 'string'
        let match = isStringPattern ? text.startsWith(pattern) : text.match(pattern)
        
        if (match) {
            const matchLength = isStringPattern ? pattern.length : match[0].length
            text = text.substring(matchLength)
            skipWhitespaceAndComments()
            
            if (transform) {
                match = typeof transform === 'string' ? transform : transform(match)
            }
        }
        
        return match
    }

    /**
     * Matches a required pattern or throws a ParserError if not found.
     * 
     * @param {string|RegExp} pattern - The pattern that must match
     * @returns {*} The match result
     * @throws {ParserError} If the pattern does not match
     */
    function requireMatch(pattern) {
        const match = tryMatch(pattern)
        if (!match) {
            throw new ParserError(`Expected pattern ${pattern} not found`, content, currentIndex)
        }
        return match
    }

    /**
     * Parses a complete ASN.1 type definition.
     * Format: TypeName ::= [APPLICATION tag] TypeExpression
     * 
     * @param {Object} definition - The definition object to populate
     */
    function parseDefinition(definition) {
        // Parse type name (must start with uppercase, PascalCase with hyphens)
        definition.name = requireMatch(/^([A-Z][0-9A-Za-z]*(?:-[A-Z][0-9A-Za-z]*)*)\s*::=/)[1]
        
        // Parse optional APPLICATION tag
        tryMatch(/^\[\s*APPLICATION\s+(\d+)\s*\]/, match => {
            definition.primitive = parseInt(match[1], 10)
        })
        
        parseType(definition)
    }

    /**
     * Parses a type expression (the right-hand side of a definition).
     * Handles SEQUENCE OF, base types, constraints, and items.
     * 
     * @param {Object} item - The item object to populate with type information
     */
    function parseType(item) {
        // Check for SEQUENCE OF or SEQUENCE SIZE(n) OF
        tryMatch(/^SEQUENCE\s*(?:SIZE\s*\(\s*(\d+)\s*\)\s*)?OF/, match => {
            item.series = match[1] ? parseInt(match[1], 10) : true
        })
        
        // Determine base type
        item.type = tryMatch('ABSTRACT-SYNTAX.&Type', 'Any')
            || tryMatch('ENUMERATED', 'Enumerated')
            || tryMatch(/^BIT\s+STRING/, 'BitString')
            || tryMatch(/^OCTET\s+STRING/, 'OctetString')
            || requireMatch(/^[A-Z][0-9A-Za-z]*(?:-[A-Z][0-9A-Za-z]*)*/)[0]
        
        // Parse SIZE constraint if present
        tryMatch(/^\(?\s*SIZE/, match => {
            parseRangeConstraint(item, true)
            if (match[0].startsWith('(')) {
                requireMatch(')')
            }
        })
        
        // Parse value range constraint
        parseRangeConstraint(item, false)
        
        // Parse items (for ENUMERATED, BIT STRING, SEQUENCE, CHOICE)
        parseItems(item)
    }

    /**
     * Parses a range constraint in the form (min..max) or (value).
     * Supports MIN/MAX keywords for unbounded ranges.
     * 
     * @param {Object} item - The item object to add the constraint to
     * @param {boolean} isSize - True if this is a SIZE constraint, false for value range
     */
    function parseRangeConstraint(item, isSize) {
        const rangePattern = /^\(\s*(MIN|[+-]?\d+(?:\.\d+)?)\s*(?:\.\.\s*(MAX|[+-]?\d+(?:\.\d+)?)\s*)?\)/
        const match = isSize ? requireMatch(rangePattern) : tryMatch(rangePattern)
        
        if (match) {
            const minValue = match[1] === 'MIN' ? Number.NEGATIVE_INFINITY : parseFloat(match[1])
            const maxValue = match[2] 
                ? (match[2] === 'MAX' ? Number.POSITIVE_INFINITY : parseFloat(match[2]))
                : minValue
            
            if (minValue > maxValue) {
                throw new ParserError(
                    `Invalid range: minimum (${minValue}) is greater than maximum (${maxValue})`,
                    content,
                    currentIndex
                )
            }
            
            item[isSize ? 'size' : 'range'] = { min: minValue, max: maxValue }
        }
    }

    /**
     * Parses items within braces for ENUMERATED, BIT STRING, SEQUENCE, or CHOICE types.
     * 
     * @param {Object} definition - The definition object to add items to
     */
    function parseItems(definition) {
        if (!tryMatch('{')) {
            return
        }
        
        const isSimpleType = ['BitString', 'Enumerated'].includes(definition.type)
        const isComplexType = ['CHOICE', 'SEQUENCE'].includes(definition.type)
        
        if (!isSimpleType && !isComplexType) {
            throw new ParserError(
                `Type '${definition.type}' cannot have items`,
                content,
                currentIndex
            )
        }
        
        definition.items = []
        
        while (skipWhitespaceAndComments()) {
            // Parse item name (must start with lowercase, kebab-case)
            const itemName = requireMatch(/^[a-z][0-9a-z]*(?:-[0-9a-z]+)*/)[0]
            const item = { name: itemName }
            
            if (isSimpleType) {
                // Simple types: name (number)
                item.number = parseInt(requireMatch(/^\(\s*(\d+)\s*\)/)[1], 10)
            } else if (isComplexType) {
                // Complex types: name [tag] Type OPTIONAL
                const tagMatch = tryMatch(/^\[(\d+)\]/)
                if (tagMatch) {
                    item.number = parseInt(tagMatch[1], 10)
                }
                
                parseType(item)
                
                if (tryMatch('OPTIONAL')) {
                    item.optional = true
                }
            }
            
            definition.items.push(item)
            
            // Check for continuation or extensibility marker
            if (tryMatch(',')) {
                // Extensibility marker (...) allowed for all types except SEQUENCE
                if (definition.type !== 'SEQUENCE' && tryMatch('...')) {
                    definition.extensible = true
                    break
                }
                continue
            }
            
            break
        }
        
        requireMatch('}')
    }

    // Parse all definitions in the content
    const definitions = []
    while (skipWhitespaceAndComments()) {
        const definition = {}
        parseDefinition(definition)
        definitions.push(definition)
    }
    
    return definitions
}

/**
 * @module bacnet-asn1-parser
 * @description Provides functionality to parse BACnet ASN.1 definitions from a string.
 * 
 * This module exports the `ParserError` class for custom error handling and the
 * `parse` function to parse BACnet ASN.1 content into structured objects.
 */
export {
    ParserError,
    parse
}
