export const PASSWORD_RULES = [
    { id: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 },
    { id: 'upper', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
    { id: 'lower', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
    { id: 'number', label: 'One number', test: (value) => /\d/.test(value) },
    { id: 'special', label: 'One special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];
export function passwordIsStrong(value) {
    return PASSWORD_RULES.every((rule) => rule.test(value));
}
