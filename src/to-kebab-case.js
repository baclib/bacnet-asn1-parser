// SPDX-FileCopyrightText: Copyright 2024-2025 The BAClib Initiative and Contributors
// SPDX-License-Identifier: BSD-2-Clause

/**
 * Converts PascalCase or camelCase BACnet type names to kebab-case.
 * @param {string} string - The input string.
 * @returns {string} The kebab-case string.
 */
export function toKebabCase(string) {
    return string.replace(/^BACnet/, 'bacnet-')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
