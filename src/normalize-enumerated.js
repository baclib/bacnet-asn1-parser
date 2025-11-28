// SPDX-FileCopyrightText: Copyright 2024-2025 The BAClib Initiative and Contributors
// SPDX-License-Identifier: BSD-2-Clause

import { toKebabCase } from './to-kebab-case.js'

// Regex to match reserved and custom ranges in comments
const regex = /^Enumerated values (\d+)-(\d+) are reserved for definition by ASHRAE\. Enumerated values (\d+)-(\d+) may be used by others/

/**
 * Normalizes a parsed BACnet enumerated type definition to a BAClib schema-compliant instance object.
 * - Converts the type name to kebab-case for the id.
 * - Sorts items alphabetically by name.
 * - Handles extensible types and sets minimum/maximum/ranges accordingly.
 * @param {object} type - The parsed BACnet enumerated type definition.
 * @returns {object} The normalized instance object.
 */
export function normalizeEnumerated(type) {
    // Sort items alphabetically by name (non-localized)
    const items = (type.items || []).sort((a, b) => {
        if (a.name < b.name) return -1
        if (a.name > b.name) return 1
        return 0
    })

    // Build the instance object for output
    let instance = {
        id: toKebabCase(type.name, true),
        name: type.name,
        base: 'enumerated',
        vendor: 0,
        items: items.map(item => ({
            name: item.name,
            value: item.number // Enumerated constant value
        })),
        extensible: !!type.extensible,
        minimum: 0,
        maximum: 0,
        ranges: []
    }

    if (instance.extensible) {
        // Try to extract reserved/custom ranges from comment
        const match = typeof type.comment === 'string' ? type.comment.match(regex) : null

        if (match) {
            instance.minimum = parseInt(match[1], 10)
            instance.maximum = parseInt(match[4], 10)
            instance.ranges = [
                {
                    custom: false,
                    minimum: instance.minimum,
                    maximum: parseInt(match[2], 10)
                },
                {
                    custom: true,
                    minimum: parseInt(match[3], 10),
                    maximum: instance.maximum
                }
            ]
        } else {
            // Fallback for known extensible types
            switch (type.name) {
                case 'BACnetEngineeringUnits':
                    instance.minimum = 0
                    instance.maximum = 65535
                    instance.ranges = [
                        { custom: false, minimum: 0, maximum: 255 },
                        { custom: false, minimum: 47808, maximum: 49999 },
                        { custom: true, minimum: 256, maximum: 47807 },
                        { custom: true, minimum: 50000, maximum: 65535 }
                    ]
                    break
                case 'BACnetPropertyIdentifier':
                    instance.minimum = 0
                    instance.maximum = 4294967295
                    instance.ranges = [
                        { custom: false, minimum: 0, maximum: 511 },
                        { custom: true, minimum: 512, maximum: 4194303 },
                        { custom: false, minimum: 4194304, maximum: 4294967295 }
                    ]
                    break
                default:
                    throw new Error(`No reserved/used range comment for extensible type: ${type.name}`)
            }
        }
    } else {
        // Non-extensible: calculate min/max from items
        instance.minimum = items.length > 0
            ? items.reduce((min, item) => item.number < min ? item.number : min, items[0].number)
            : 0
        instance.maximum = items.length > 0
            ? items.reduce((max, item) => item.number > max ? item.number : max, items[0].number)
            : 0
        instance.ranges = [
            {
                custom: false,
                minimum: instance.minimum,
                maximum: instance.maximum
            }
        ]
    }

    return instance
}
