/**
 * Create Network Wizard — Validators
 * Per-step validation matching HPE wizard flow.
 */
import { SECURITY_NEEDS_PSK } from './constants';

export const VALIDATORS = {
    // Step 1: Network Identification
    name: (form) => {
        const errors = {};
        const name = (form.networkName || '').trim();
        if (!name) errors.networkName = 'Network name is required.';
        else if (name.length > 32) errors.networkName = 'Name must be 32 characters or less.';
        return { valid: Object.keys(errors).length === 0, errors };
    },

    // Step 2: Network Properties (wireless)
    properties: (form) => {
        const errors = {};
        if (SECURITY_NEEDS_PSK.has(form.securityOption)) {
            const psk = form.preSharedKey || '';
            if (psk.length < 8) errors.preSharedKey = 'Password must be at least 8 characters.';
            else if (psk.length > 63) errors.preSharedKey = 'Password must be 63 characters or less.';
        }
        return { valid: Object.keys(errors).length === 0, errors };
    },

    // Step 3: IP Assignment (wireless) — also the submit step
    ip_assignment: (form) => {
        const errors = {};
        if (form.vlanId !== '' && form.vlanId !== null && form.vlanId !== undefined) {
            const vlan = Number(form.vlanId);
            if (isNaN(vlan) || vlan < 1 || vlan > 4094) errors.vlanId = 'VLAN must be between 1 and 4094.';
        }
        if (form.ipAssignment === 'specific') {
            const addr = (form.networkAddress || '').trim();
            if (!addr) {
                errors.networkAddress = 'Network address is required.';
            } else {
                const parts = addr.split('.');
                if (parts.length !== 4 || parts.some((p) => isNaN(p) || Number(p) < 0 || Number(p) > 255)) {
                    errors.networkAddress = 'Invalid IP address format.';
                }
            }
        }
        return { valid: Object.keys(errors).length === 0, errors };
    },

    // Step 2: Wired properties
    wired_properties: (form) => {
        const errors = {};
        const raw = String(form.vlanId || '').trim();
        if (!raw) {
            errors.vlanId = 'VLAN ID is required.';
        } else {
            const vlan = Number(raw);
            if (isNaN(vlan) || vlan < 1 || vlan > 4094) errors.vlanId = 'VLAN must be between 1 and 4094.';
        }
        return { valid: Object.keys(errors).length === 0, errors };
    },

    // Step 3: Wired review (no validation needed)
    wired_review: () => ({ valid: true, errors: {} }),
};
