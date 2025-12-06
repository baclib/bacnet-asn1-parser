// SPDX-FileCopyrightText: Copyright 2024-2025, The BAClib Initiative and Contributors
// SPDX-License-Identifier: EPL-2.0

import { toAlias } from './to-alias.js';
import predefinedAbstract from './predefined-abstract.json' with { type: 'json' };

/**
 * Generates an array of predefined BACnet/BAClib type definitions.
 *
 * This function transforms abstract type definitions from the predefined configuration
 * into normalized BACnet/BAClib type definitions suitable for further use.
 *
 * Each generated type definition contains:
 * - alias: kebab-case identifier for use within BAClib
 * - name: original BACnet type name
 * - base: the underlying application tag or BAClib base type number
 * - series: indicates if this is an array type (always false for predefined types)
 * - range: object with minimum and maximum constraints (only for numerical types)
 *
 * Range constraints are only included when both minimum and maximum bounds are
 * defined in the abstract type definitions.
 *
 * @returns {Array<Object>} Array of normalized predefined BACnet/BAClib type definitions
 */
export function generatePredefined() {
    return predefinedAbstract.definitions.map(definition => {

        // mandatory predefined type definition
        let type = {
            alias: toAlias(definition.name, false),
            name: definition.name,
            base: definition.base,
            series: false
        };

        // Determine if range constraints are defined
        if (definition.minimum !== undefined && definition.maximum !== undefined) {
            type.range = {
                minimum: definition.minimum,
                maximum: definition.maximum
            };
        }

        // Return normalized type definition
        return type;
    });
}
