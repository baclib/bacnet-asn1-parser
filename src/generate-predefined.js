// SPDX-FileCopyrightText: Copyright 2024-2026, The BAClib Initiative and Contributors
// SPDX-License-Identifier: EPL-2.0

/**
 * @fileoverview Generates predefined BACnet/BAClib type definitions from abstract specifications.
 * 
 * This module transforms abstract type definitions (from predefined-abstract.json) into
 * normalized BACnet/BAClib type definitions. It serves two purposes:
 * 
 * 1. **As a Module**: Export the `generatePredefined()` function for programmatic use
 * 2. **As a Script**: When executed directly with Node.js, generates JSON files for each
 *    predefined type in the `../predefined/` directory
 * 
 * Usage as a module:
 *   import { generatePredefined } from './generate-predefined.js';
 *   const types = generatePredefined();
 * 
 * Usage as a script:
 *   node src/generate-predefined.js
 * 
 * The script outputs JSON files to the predefined directory relative to this script's location,
 * ensuring correct paths regardless of the current working directory.
 */
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { toBaclibName } from './to-baclib-name.js';
import predefinedAbstract from './predefined-abstract.json' with { type: 'json' };

/**
 * Generates an array of predefined BACnet/BAClib type definitions.
 *
 * This function transforms abstract type definitions from the predefined configuration
 * (predefined-abstract.json) into normalized BACnet/BAClib type definitions suitable 
 * for further processing and validation.
 *
 * Transformation Process:
 * - Maps each abstract definition to a normalized type object
 * - Converts type names to BAClib kebab-case format using toBaclibName()
 * - Preserves primitive type indicators (application tags)
 * - Resolves type references to base types
 * - Normalizes range constraints (minimum/maximum values)
 * - Handles length and size constraints for string types
 *
 * Generated Type Structure:
 * Each type definition contains the following properties:
 * 
 * - `alias` (string): Original type name in PascalCase (e.g., "Unsigned8", "BitString")
 * - `name` (string): BAClib kebab-case identifier (e.g., "unsigned-8", "bit-string")
 * - `primitive` (number, optional): BACnet application tag number (0-15) for primitive types
 * - `type` (string, optional): Reference to a base type name (e.g., "unsigned" for Unsigned8)
 * - `minimum` (string|number, optional): Minimum value constraint for numerical types
 * - `maximum` (string|number, optional): Maximum value constraint for numerical types
 * - `length` (object|number, optional): Length constraints for string/octet types
 *   - When object: { minimum: number, maximum: number }
 *   - When number: fixed size value
 *
 * Constraint Handling:
 * - Range constraints (minimum/maximum) are only included when a maximum is defined
 * - If minimum is not explicitly defined, it defaults to 0
 * - Special values like "MAX", "MIN" are preserved as strings for later resolution
 * - Length constraints can be either a fixed size or a range object
 *
 * @returns {Array<Object>} Array of normalized predefined BACnet/BAClib type definitions.
 *                          Each object represents a complete type specification ready for
 *                          use in BACnet protocol parsing and validation.
 * 
 * @example
 * const types = generatePredefined();
 * // Returns:
 * // [
 * //   { alias: "Unsigned8", name: "unsigned-8", primitive: 1, minimum: 0, maximum: 255 },
 * //   { alias: "Integer32", name: "integer-32", base: 3, minimum: -2147483648, maximum: 2147483647 },
 * //   { alias: "BACnetWeekNDay", name: "week-n-day", type: "octet-string", length: 3 }
 * // ]
 */
export function generatePredefined() {

    return predefinedAbstract.definitions.map(definition => {

        // Initialize type with required properties (alias and name)
        const type = {
            alias: definition.name,
            name: toBaclibName(definition.name, false)
        };

        // Copy primitive tag number if defined (e.g., 0 for Null, 1 for Boolean/Unsigned)
        if (Object.hasOwn(definition, 'primitive')) {
            type.primitive = definition.primitive;
        }

        // Copy type reference if defined (e.g., "Unsigned" for Unsigned8)
        if (Object.hasOwn(definition, 'type')) {
            type.type = toBaclibName(definition.type, false);
        }

        // Handle range constraints for numerical types
        // Only add range if maximum is defined; minimum defaults to 0 if not specified
        if (Object.hasOwn(definition, 'maximum')) {
            type.minimum = Object.hasOwn(definition, 'minimum') ? definition.minimum : 0;
            type.maximum = definition.maximum;
        }

        // Handle length constraints for string types
        // Creates a range object { minimum: 0, maximum: <length> }
        if (Object.hasOwn(definition, 'length')) {
            type.length = { minimum: 0, maximum: definition.length };
        }

        // Handle size constraints (fixed length)
        if (Object.hasOwn(definition, 'size')) {
            type.length = definition.size;
        }

        return type;
    });
}

/**
 * Main Execution Block
 * 
 * This block executes only when the script is run directly with Node.js, not when imported as a module.
 * It generates JSON files for each predefined type definition in the `../predefined/` directory.
 * 
 * Behavior:
 * - Checks if this script is the entry point using import.meta.url and process.argv[1]
 * - Generates all predefined type definitions
 * - Outputs each type as formatted JSON to console
 * - Writes each type to a separate JSON file named after the type's name property
 * - Uses URL resolution based on import.meta.url to ensure correct file paths
 *   regardless of the current working directory
 * 
 * File Output:
 * - Location: ../predefined/ (relative to this script)
 * - Naming: {type.name}.json (e.g., "unsigned-8.json", "week-n-day.json")
 * - Format: Pretty-printed JSON with 4-space indentation
 * 
 * Example Usage:
 *   node src/generate-predefined.js
 * 
 * This will generate files like:
 *   predefined/unsigned-8.json
 *   predefined/integer-32.json
 *   predefined/week-n-day.json
 *   ...etc
 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {

    // Helper function to resolve file paths relative to this script's location
    const path = (name) => new URL(`../predefined/${name}.json`, import.meta.url);

    // Generate all predefined type definitions
    const instances = generatePredefined();

    // Output and write each type to its own JSON file
    instances.forEach(instance => {

        // Log to console for visibility
        console.log(JSON.stringify(instance, null, 4));

        // Write to file in predefined directory (async operation)
        fs.writeFile(path(instance.name), JSON.stringify(instance, null, 4));
    });
}
