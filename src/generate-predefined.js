// SPDX-FileCopyrightText: Copyright 2024-2025 The BAClib Initiative and Contributors
// SPDX-License-Identifier: BSD-2-Clause

import { toKebabCase } from './to-kebab-case.js'
import predefinedAbstract from './predefined-abstract.json' with { type: 'json' }

/**
 * Generates an array of predefined BACnet type instances.
 *
 * Each instance contains:
 * - id: kebab-case identifier
 * - name: original type name
 * - base: numeric base type
 * - vendor: vendor ID (default: 0)
 * - minimum: minimum value (if defined)
 * - maximum: maximum value (if defined)
 *
 * @returns {Array<Object>} Array of BACnet predefined type instances.
 */
export function generatePredefined() {
    // Map each predefined abstract definition to an instance object
    const instances = predefinedAbstract.definitions.map(definition => ({
        id: toKebabCase(definition.name, false).replace(/(\D)(\d+)$/, '$1-$2'),
        name: definition.name,
        base: definition.base,
        vendor: 0,
        minimum: definition.minimum ?? null,
        maximum: definition.maximum ?? null
    }));

    return instances;
}
