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
 * - Preserves primitive type indicators:
 *   - 0-15: BACnet application tags for primitive data types
 *   - Negative values for special constructions: -1 = any, -2 = choice, -3 = sequence
 * - Resolves type references to base types
 * - Normalizes range constraints (minimum/maximum values)
 * - Handles length and size constraints for string types
 *
 * Generated Type Structure:
 * Each type definition contains the following properties:
 * 
 * - `alias` (string): Original type name in PascalCase (e.g., "Unsigned8", "BitString")
 * - `name` (string): BAClib kebab-case identifier (e.g., "unsigned-8", "bit-string")
 * - `primitive` (number, optional): Type indicator:
 *   - 0-15: BACnet application tag for primitive data types
 *   - -1: Any type, -2: Choice construction, -3: Sequence construction
 * - `type` (string|object, optional): Type reference, which can be:
 *   - A string: Simple reference to a base type (when no constraints are present)
 *   - An object: Complex type with constraints, containing:
 *     - `base` (string): Reference to the base type name
 *     - `minimum` (string|number, optional): Minimum value constraint for numerical types.
 *       Can be a string to safely represent 64-bit integers (which JSON doesn't natively
 *       support) or special values like MIN, MAX, INF, NAN, etc.
 *     - `maximum` (string|number, optional): Maximum value constraint for numerical types.
 *       Can be a string to safely represent 64-bit integers (which JSON doesn't natively
 *       support) or special values like MIN, MAX, INF, NAN, etc.
 *     - `length` (number, optional): Fixed length constraint for string/octet types
 *
 * Constraint Handling:
 * - Type property structure depends on presence of constraints:
 *   - Simple string: When only base type is needed (e.g., alias with no additional constraints)
 *   - Object with base + constraints: When any constraints (range, length, size) are present
 * - Range constraints (minimum/maximum) are added to the type object when maximum is defined
 * - If minimum is not explicitly defined in the source, it defaults to 0
 * - Minimum and maximum values can be strings or numbers:
 *   - Strings are used to safely represent 64-bit integers (which JSON doesn't natively support)
 *   - Strings are also used for special values like MIN, MAX, INF, NAN when required
 * - Length constraints: Created as { minimum: 0, maximum: <value> } from the length property
 * - Size constraints: Applied directly as a fixed length value from the size property
 *
 * @returns {Array<Object>} Array of normalized predefined BACnet/BAClib type definitions.
 *                          Each object represents a complete type specification ready for
 *                          use in BACnet protocol parsing and validation.
 * 
 * @example
 * const types = generatePredefined();
 * // Returns:
 * // [
 * //   { alias: "Null", name: "null", primitive: 0 },
 * //   { alias: "Unsigned8", name: "unsigned-8", type: { base: "unsigned", minimum: 0, maximum: 255 } },
 * //   { alias: "BACnetWeekNDay", name: "week-n-day", type: { base: "octet-string", length: 3 } }
 * // ]
 */
export function generatePredefined() {

    return predefinedAbstract.definitions.map(predefined => {

        // Initialize type definition with required properties (alias and name)
        const definition = {
            alias: predefined.name,
            name: toBaclibName(predefined.name, false)
        };

        // Return primitive type definition
        if (Object.hasOwn(predefined, 'primitive')) {
            definition.primitive = predefined.primitive;
            return definition;
        }

        // Set type property with base reference
        // Use simple string if only name and base are present (no constraints)
        // Otherwise, use object structure to accommodate constraints
        const base = toBaclibName(predefined.base, false);
        definition.type = Object.keys(predefined).length === 2 ? base : { base };

        // Handle range constraints for numerical types
        // Add minimum and maximum to the type object when maximum is defined
        // Minimum defaults to 0 if not specified in the abstract definition
        if (Object.hasOwn(predefined, 'maximum')) {
            definition.type.minimum = Object.hasOwn(predefined, 'minimum') ? predefined.minimum : 0;
            definition.type.maximum = predefined.maximum;
        }

        // Handle length constraints for string/bit-string types
        // Converts length value to range object { minimum: 0, maximum: <length> }
        if (Object.hasOwn(predefined, 'length')) {
            definition.type.length = { minimum: 0, maximum: predefined.length };
        }

        // Handle size constraints for octet-string types
        // Apply size directly as a fixed length value (not a range object)
        if (Object.hasOwn(predefined, 'size')) {
            definition.type.length = predefined.size;
        }

        return definition;
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
