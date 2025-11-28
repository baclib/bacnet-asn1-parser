// SPDX-FileCopyrightText: Copyright 2024-2025 The BAClib Initiative and Contributors
// SPDX-License-Identifier: BSD-2-Clause

/**
 * Converts a BACnet type name from PascalCase or camelCase to kebab-case.
 * Optionally replaces a leading "BACnet" with "0-" if prefix is true, or removes it if prefix is false.
 * All occurrences of "BACnet" are replaced with "Bacnet".
 * @param {string} string - The input string to convert.
 * @param {boolean} [prefix] - If true, replaces leading "BACnet" with "0-". If false, removes it.
 * @returns {string} The converted kebab-case string.
 */
export function toKebabCase(string, prefix) {
    if (typeof prefix === 'boolean') {
        string = string.replace(/^BACnet/, prefix ? '0-' : '');
    }
    return string.replace(/BACnet/g, 'Bacnet')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
