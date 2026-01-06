// SPDX-FileCopyrightText: Copyright 2024-2026, The BAClib Initiative and Contributors
// SPDX-License-Identifier: EPL-2.0

/**
 * Converts a BACnet item/type name to a BAClib item/type name in kebab-case format.
 * 
 * Transformation Rules:
 * 1. Leading "BACnet-?" handling (controlled by the `prefix` parameter):
 *    - If prefix is `false`: removes leading "BACnet-?"
 *    - If prefix is `true`: replaces leading "BACnet-?" with "0-"
 *    - If prefix is a string: replaces leading "BACnet-?" with that string
 *    - If prefix is an integer: replaces leading "BACnet-?" with the integer followed by a dash
 *    - If prefix is omitted/undefined: "BACnet" is kept and converted to "bacnet"
 * 
 * 2. All remaining occurrences of "BACnet" are replaced with "Bacnet"
 * 
 * 3. CamelCase to kebab-case conversion:
 *    - Inserts dashes between lowercase/digit and uppercase letters
 *    - Inserts dashes between uppercase letters followed by uppercase+lowercase
 * 
 * 4. Number separation (conditional):
 *    - If the ORIGINAL input string starts with an uppercase letter,
 *      inserts dashes between letters and digits (e.g., Unsigned8 -> unsigned-8)
 *    - If the input starts with lowercase, no letter-digit separation occurs
 *      (e.g., myProperty8 -> my-property8, not my-property-8)
 * 
 * 5. Final conversion to lowercase
 *
 * Examples - Prefix Handling:
 *   toBaclibName('BACnetPropertyReference')            // 'bacnet-property-reference'
 *   toBaclibName('BACnetPropertyReference', true)      // '0-property-reference'
 *   toBaclibName('BACnetPropertyReference', false)     // 'property-reference'
 *   toBaclibName('BACnetPropertyReference', 'custom-') // 'custom-property-reference'
 *   toBaclibName('BACnetPropertyReference', 42)        // '42-property-reference'
 * 
 * Examples - Number Separation (uppercase start):
 *   toBaclibName('Unsigned16')                         // 'unsigned-16'
 *   toBaclibName('Integer32')                          // 'integer-32'
 *   toBaclibName('BitString64')                        // 'bit-string-64'
 *   toBaclibName('Enumerated8')                        // 'enumerated-8'
 * 
 * Examples - No Number Separation (lowercase start):
 *   toBaclibName('dec-vt220')                          // 'dec-vt220'
 *   toBaclibName('property16')                         // 'property16'
 * 
 * Examples - General Cases:
 *   toBaclibName('BACnetSomethingBACnetElse')          // 'bacnet-something-bacnet-else'
 *   toBaclibName('SomeOtherType')                      // 'some-other-type'
 *   toBaclibName('HTTPResponse')                       // 'http-response'
 *   toBaclibName('XMLParser')                          // 'xml-parser'
 *
 * @param {string} string - The input string to convert (typically a type or property name).
 * @param {boolean|string|number} [prefix] - Controls how the leading "BACnet" is handled (see transformation rules).
 * @returns {string} The converted kebab-case alias string.
 */
export function toBaclibName(string, prefix) {

    // Normalize prefix parameter
    if (prefix === false) {
        prefix = '';
    } else if (prefix === true) {
        prefix = '0-';
    } else if (Number.isInteger(prefix)) {
        prefix = prefix + '-';
    }

    // Replace leading BACnet with prefix if provided
    if (typeof prefix === 'string') {
        string = string.replace(/^BACnet-?/, prefix);
    }

    // Convert to kebab-case
    let result = string
        .replace(/BACnet/g, 'Bacnet')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2');

    // Add dashes between letters and digits only if string starts with uppercase
    if (/^[A-Z]/.test(string)) {
        result = result.replace(/([a-zA-Z])(\d)/g, '$1-$2');
    }

    return result.toLowerCase();
}
