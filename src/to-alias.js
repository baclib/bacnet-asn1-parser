// SPDX-FileCopyrightText: Copyright 2024-2025, The BAClib Initiative and Contributors
// SPDX-License-Identifier: EPL-2.0

/**
 * Converts a BACnet item/type name to a BAClib item/type alias.
 * Optionally replaces a leading "BACnet" with a prefix:
 *   - If prefix is false, removes leading "BACnet"
 *   - If prefix is true, replaces leading "BACnet" with "0-"
 *   - If prefix is a string, replaces leading "BACnet" with that string
 *   - If prefix is an integer, replaces leading "BACnet" with that integer followed by a dash
 * All other occurrences of "BACnet" are replaced with "Bacnet" and the result is finally converted to kebab-case.
 *
 * Examples:
 *   toAlias('BACnetPropertyReference')            // 'bacnet-property-reference'
 *   toAlias('BACnetPropertyReference', true)      // '0-property-reference'
 *   toAlias('BACnetPropertyReference', false)     // 'property-reference'
 *   toAlias('BACnetPropertyReference', 'acme-')   // 'acme-property-reference'
 *   toAlias('BACnetPropertyReference', 42)        // '42-property-reference'
 *   toAlias('BACnetSomethingBACnetElse')          // 'bacnet-something-bacnet-else'
 *   toAlias('SomeOtherType')                      // 'some-other-type'
 *
 * @param {string} string - The input string to convert.
 * @param {boolean|string|number} [prefix] - Prefix logic as described above.
 * @returns {string} The converted kebab-case string.
 */
export function toAlias(string, prefix) {
    prefix = prefix === false ? '' : prefix === true ? '0-' : Number.isInteger(prefix) ? prefix + '-' : prefix;
    if (typeof prefix === 'string') {
        string = string.replace(/^BACnet/, prefix);
    }
    return string.replace(/BACnet/g, 'Bacnet')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
