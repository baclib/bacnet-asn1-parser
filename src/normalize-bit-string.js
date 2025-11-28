// SPDX-FileCopyrightText: Copyright 2024-2025 The BAClib Initiative and Contributors
// SPDX-License-Identifier: BSD-2-Clause

import { toKebabCase } from './to-kebab-case.js'

/**
 * Normalizes a parsed BACnet bit string type definition to a BAClib schema-compliant instance object.
 * - Converts the type name to kebab-case for the id.
 * - Sorts items by bit number.
 * - Handles extensible types and sets minimum/maximum/ranges accordingly.
 * @param {object} type - The parsed BACnet bit string type definition.
 * @returns {object} The normalized instance object.
 */
export function normalizeBitString(type) {
    // Sort items ascending by bit number
    const items = (type.items || []).sort((a, b) => a.number - b.number)

    // Build the instance object for output
    let instance = {
        id: toKebabCase(type.name, true), // Kebab-case id with prefix handling
        name: type.name,
        base: 'bit-string',
        vendor: 0,
        items: items.map(item => ({
            bit: item.number, // Bit position
            name: item.name
        })),
        extensible: !!type.extensible,
        minimum: 0,
        maximum: 0,
        ranges: []
    }

    // Determine highest bit number used, fallback to 0 if no items
    let highestBit = items.length > 0
        ? items.reduce((max, item) => item.number > max ? item.number : max, items[0].number)
        : 0

    // Handle extensible types and known BACnet bit string types
    if (instance.extensible || type.name === 'BACnetObjectTypesSupported' || type.name === 'BACnetServicesSupported') {
        switch (type.name) {
            case 'BACnetAuditOperationFlags':
                instance.minimum = highestBit
                instance.maximum = 63
                instance.ranges = [
                    { custom: false, minimum: 0, maximum: 31 },
                    { custom: true, minimum: 32, maximum: 63 }
                ]
                break
            case 'BACnetObjectTypesSupported':
                instance.minimum = 17
                instance.maximum = 1023
                instance.ranges = [
                    { custom: false, minimum: 0, maximum: 127 },
                    { custom: true, minimum: 128, maximum: 1023 }
                ]
                break
            case 'BACnetServicesSupported':
                instance.minimum = 34
                instance.maximum = 511
                instance.ranges = [
                    { custom: false, minimum: 0, maximum: 511 }
                ]
                break
            default:
                throw new Error(`Unknown reserved/used range for extensible type: ${type.name}`)
        }
    } else {
        // Non-extensible: Use highest bit for fixed length
        instance.minimum = highestBit
        instance.maximum = highestBit
        instance.ranges = [
            {
                custom: false,
                minimum: highestBit,
                maximum: highestBit
            }
        ]
    }

    return instance
}
