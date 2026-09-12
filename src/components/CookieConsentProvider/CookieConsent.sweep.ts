import {classifyStorageEntry} from './CookieConsent.inventory'
import type {CookieCategoryRules, CookieMatchRule} from '../../types'

export interface CookieConsentSweepOptions {
    /** Category map from the decision that was just stored. Anything not
     *  explicitly `true` counts as rejected. */
    categories: Record<string, boolean>
    requiredCookies?: CookieMatchRule[]
    categoryRules?: CookieCategoryRules
    /** Names the sweep must never remove — Honey's own consent record. Matched
     *  case-insensitively against both cookies and storage keys. */
    protectedNames?: string[]
}

export interface CookieConsentSweepResult {
    cookies: string[]
    localStorage: string[]
    sessionStorage: string[]
}

const EMPTY_RESULT: CookieConsentSweepResult = {cookies: [], localStorage: [], sessionStorage: []}

/**
 * Withdrawing consent has to be as easy as giving it, and that includes what is
 * already on the device: a value stored while a category was allowed must not
 * outlive the moment the visitor turns that category off.
 *
 * The sweep is deliberately narrow. It only removes entries a rule actually
 * recognised — the site's own `categoryRules` (`custom`) or Honey's built-in
 * vendor patterns (`built-in`). Entries that merely fell through to
 * `preferences` because nothing matched (`fallback`) are left alone: they are
 * displayed under that category, but Honey does not know what they are, and
 * deleting unknown application state would be worse than keeping it.
 */
export function sweepRejectedStorage({
    categories,
    requiredCookies = [],
    categoryRules = {},
    protectedNames = [],
}: CookieConsentSweepOptions): CookieConsentSweepResult {
    if (typeof window === 'undefined') {
        return EMPTY_RESULT
    }

    const protectedSet = new Set(
        protectedNames.filter((name) => typeof name === 'string' && name !== '').map((name) => name.toLowerCase())
    )

    const shouldRemove = (name: string) => {
        if (protectedSet.has(name.trim().toLowerCase())) {
            return false
        }

        const {category, required, matchedBy} = classifyStorageEntry(name, requiredCookies, categoryRules)

        if (required || matchedBy === 'fallback') {
            return false
        }

        return categories[category] !== true
    }

    return {
        cookies: sweepCookies(shouldRemove),
        localStorage: sweepWebStorage('localStorage', shouldRemove),
        sessionStorage: sweepWebStorage('sessionStorage', shouldRemove),
    }
}

function sweepCookies(shouldRemove: (name: string) => boolean): string[] {
    if (typeof document === 'undefined' || !document.cookie) {
        return []
    }

    const removed: string[] = []

    for (const chunk of document.cookie.split(';')) {
        const trimmed = chunk.trim()
        if (!trimmed) {
            continue
        }

        const separatorIndex = trimmed.indexOf('=')
        const name = (separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex)).trim()

        if (!name || !shouldRemove(name)) {
            continue
        }

        expireCookie(name)
        removed.push(name)
    }

    return removed
}

/** A cookie can only be expired from script by rewriting it with the same
 *  path and domain it was set with, and that pair is not readable back from
 *  `document.cookie`. Try the combinations a first-party cookie realistically
 *  uses; anything set on another path or by a third party stays out of reach. */
function expireCookie(name: string) {
    const encoded = encodeURIComponent(name)
    const hostname = window.location?.hostname ?? ''
    const scopes = ['', `; domain=${hostname}`, `; domain=.${hostname}`]

    for (const scope of scopes) {
        try {
            document.cookie = `${encoded}=; path=/; max-age=0; samesite=lax${scope}`
        } catch {
            /* a scope we are not allowed to write — try the next one */
        }
    }
}

function sweepWebStorage(kind: 'localStorage' | 'sessionStorage', shouldRemove: (name: string) => boolean): string[] {
    let store: Storage | null = null

    try {
        store = window[kind]
    } catch {
        // Private mode or blocked site data — nothing to sweep.
        return []
    }

    if (!store) {
        return []
    }

    const removed: string[] = []

    try {
        // Snapshot the keys first: removing while enumerating reindexes the store.
        const keys: string[] = []
        for (let index = 0; index < store.length; index++) {
            const key = store.key(index)
            if (key) {
                keys.push(key)
            }
        }

        for (const key of keys) {
            if (!shouldRemove(key)) {
                continue
            }

            store.removeItem(key)
            removed.push(key)
        }
    } catch {
        /* quota or security error mid-sweep — keep whatever was removed */
    }

    return removed
}
