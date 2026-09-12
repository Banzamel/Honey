import {COOKIE_CONSENT_COOKIE_NAME} from './CookieConsent.defaults'
import type {CookieCategoryRules, CookieMatchRule, DetectedCookie} from '../../types'

/**
 * Patterns that always classify a cookie as necessary, regardless of consumer
 * config. Covers framework sessions (PHP, Java, ASP.NET), Same-Site prefixed
 * cookies, CSRF/XSRF guards and generic auth/token/session names. The local
 * Honey storage cookie is always required so the consent state itself never
 * triggers a banner about itself.
 */
const INTERNAL_REQUIRED_COOKIE_RULES: CookieMatchRule[] = [
    COOKIE_CONSENT_COOKIE_NAME,
    /^PHPSESSID$/i,
    /^JSESSIONID$/i,
    /^ASP\.NET_SessionId$/i,
    /^__Host-/i,
    /^__Secure-/i,
    /csrf/i,
    /xsrf/i,
    /session/i,
    /auth/i,
    /token/i,
    /^sid$/i,
]

/** Built-in classifier for common third-party cookies. Consumers can extend
 *  this via the provider's `categoryRules` prop. */
const BUILT_IN_CATEGORY_RULES: Record<string, CookieMatchRule[]> = {
    preferences: [/theme/i, /locale/i, /lang/i, /currency/i, /timezone/i, /consent/i],
    analytics: [/^_ga/i, /^_gid/i, /^_gat/i, /^_pk_/i, /^pk_/i, /^_hj/i, /^hj/i, /^amplitude/i, /^mp_/i, /^matomo/i],
    marketing: [/^_fbp$/i, /^_fbc$/i, /^_gcl_/i, /^IDE$/i, /^test_cookie$/i, /^li_/i, /^tt_/i, /^_uet/i, /^pin_utm/i],
}

function matchCookieRule(name: string, rule: CookieMatchRule) {
    if (typeof rule === 'string') {
        const normalizedRule = rule.trim().toLowerCase()
        const normalizedName = name.trim().toLowerCase()

        if (normalizedRule.endsWith('*')) {
            return normalizedName.startsWith(normalizedRule.slice(0, -1))
        }

        return normalizedName === normalizedRule
    }

    return rule.test(name)
}

function matchCookieRules(name: string, rules?: CookieMatchRule[]) {
    return Array.isArray(rules) && rules.some((rule) => matchCookieRule(name, rule))
}

function parseDocumentCookies(cookieString: string) {
    if (!cookieString.trim()) {
        return []
    }

    return cookieString
        .split(';')
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
            const separatorIndex = chunk.indexOf('=')
            if (separatorIndex === -1) {
                return {name: chunk, value: ''}
            }

            return {
                name: chunk.slice(0, separatorIndex).trim(),
                value: chunk.slice(separatorIndex + 1).trim(),
            }
        })
        .filter((item) => item.name.length > 0)
}

/** Shared classifier for anything a site stores under a name: cookies and
 *  Web Storage keys alike. `matchedBy` records how confident the answer is,
 *  which is what lets the sweep leave `fallback` entries untouched. */
export function classifyStorageEntry(
    name: string,
    requiredCookies: CookieMatchRule[],
    categoryRules: CookieCategoryRules
): Pick<DetectedCookie, 'category' | 'required' | 'matchedBy'> {
    if (matchCookieRules(name, [...INTERNAL_REQUIRED_COOKIE_RULES, ...requiredCookies])) {
        return {category: 'necessary', required: true, matchedBy: 'required'}
    }

    for (const [category, rules] of Object.entries(categoryRules)) {
        if (matchCookieRules(name, rules)) {
            return {category, required: false, matchedBy: 'custom'}
        }
    }

    for (const [category, rules] of Object.entries(BUILT_IN_CATEGORY_RULES)) {
        if (matchCookieRules(name, rules)) {
            return {category, required: false, matchedBy: 'built-in'}
        }
    }

    return {category: 'preferences', required: false, matchedBy: 'fallback'}
}

export function detectDocumentCookies({
    cookieString,
    requiredCookies = [],
    categoryRules = {},
}: {
    cookieString?: string
    requiredCookies?: CookieMatchRule[]
    categoryRules?: CookieCategoryRules
}) {
    const source = cookieString ?? (typeof document !== 'undefined' ? document.cookie : '')

    return parseDocumentCookies(source).map<DetectedCookie>((item) => {
        const classification = classifyStorageEntry(item.name, requiredCookies, categoryRules)

        return {
            name: item.name,
            value: item.value,
            category: classification.category,
            required: classification.required,
            matchedBy: classification.matchedBy,
            source: 'document.cookie',
        }
    })
}
