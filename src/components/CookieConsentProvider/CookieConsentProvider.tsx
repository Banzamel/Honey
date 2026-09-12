import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {HONEY_CONSENT_CHANGE_EVENT} from './bootstrap-events'
import {CookieConsentContextProvider, type CookieConsentContextValue} from './CookieConsentContext'
import {detectDocumentCookies} from './CookieConsent.inventory'
import {sweepRejectedStorage, type CookieConsentSweepResult} from './CookieConsent.sweep'
import {
    COOKIE_CONSENT_COOKIE_MAX_AGE_DAYS,
    COOKIE_CONSENT_COOKIE_NAME,
    COOKIE_CONSENT_STORAGE,
    COOKIE_CONSENT_STORAGE_KEY,
    DEFAULT_HONEY_TEXTS,
    createCookieConsentCategories,
    createCookieConsentDeclaration,
    mergeCookieConsentTexts,
} from './CookieConsent.defaults'
import {clearStoredCookieConsent, readStoredCookieConsent, writeStoredCookieConsent} from './CookieConsent.storage'
import type {
    CookieCategoryDefinition,
    CookieCategoryRules,
    CookieConsentMode,
    CookieConsentPersistence,
    CookieConsentSource,
    CookieConsentState,
    CookieDeclarationItem,
    CookieMatchRule,
    DetectedCookie,
    HoneyCookieConsentTexts,
} from '../../types'

const EMPTY_COOKIE_RULES: never[] = []
const EMPTY_CATEGORY_RULES = {}

export interface CookieConsentProviderProps {
    children: ReactNode
    /** Version tag stored alongside the consent. Bumping it re-opens the banner
     *  so the user re-confirms when categories or wording change materially. */
    version?: string
    /** Storage key used when `storage === 'localStorage'`. */
    storageKey?: string
    /** Persist consent across reloads. Off for ephemeral preview UIs. Default `true`. */
    persist?: boolean
    storage?: CookieConsentPersistence
    cookieName?: string
    cookieMaxAgeDays?: number
    categories?: CookieCategoryDefinition[]
    declaration?: CookieDeclarationItem[]
    defaultConsent?: Partial<Record<string, boolean>>
    mode?: CookieConsentMode
    hideOnAccept?: boolean
    autoShow?: boolean
    reopenOnVersionChange?: boolean
    /** Override individual text fields. Fields you omit fall back to Honey's
     *  English defaults — see `DEFAULT_HONEY_TEXTS`. */
    texts?: Partial<HoneyCookieConsentTexts>
    loadDeclaration?: () => Promise<CookieDeclarationItem[]>
    loadConsent?: () => Promise<CookieConsentState | null>
    saveConsent?: (state: CookieConsentState) => void | Promise<void>
    requiredCookies?: CookieMatchRule[]
    categoryRules?: CookieCategoryRules
    onDetectedCookies?: (cookies: DetectedCookie[]) => void | Promise<void>
    onConsentChange?: (state: CookieConsentState) => void
    onAcceptAll?: (state: CookieConsentState) => void
    onRejectAll?: (state: CookieConsentState) => void
    onWithdraw?: () => void
    /** Remove the storage a category owned as soon as that category is turned
     *  off, so a withdrawn consent does not leave its values on the device.
     *  Only entries an explicit rule recognised are removed — see
     *  `sweepRejectedStorage`. Default `true`. */
    sweepOnReject?: boolean
    /** Fires after a sweep that actually removed something. */
    onSweep?: (removed: CookieConsentSweepResult) => void
}

function normalizeCategories(
    categories: CookieCategoryDefinition[],
    values?: Record<string, boolean> | null,
    defaultConsent?: Partial<Record<string, boolean>>
) {
    return categories.reduce<Record<string, boolean>>((acc, category) => {
        const nextValue = values?.[category.key] ?? defaultConsent?.[category.key] ?? category.defaultValue ?? false
        acc[category.key] = category.required ? true : Boolean(nextValue)
        return acc
    }, {})
}

function buildConsentState(
    version: string,
    source: CookieConsentSource,
    categories: CookieCategoryDefinition[],
    values?: Record<string, boolean>,
    defaultConsent?: Partial<Record<string, boolean>>
): CookieConsentState {
    return {
        version,
        decidedAt: new Date().toISOString(),
        source,
        categories: normalizeCategories(categories, values, defaultConsent),
    }
}

function isCurrentVersion(state: CookieConsentState | null, version: string) {
    return state != null && state.version === version
}

function areDetectedCookiesEqual(previous: DetectedCookie[], next: DetectedCookie[]) {
    if (previous.length !== next.length) {
        return false
    }

    return previous.every((item, index) => {
        const candidate = next[index]
        return (
            item.name === candidate.name &&
            item.value === candidate.value &&
            item.category === candidate.category &&
            item.required === candidate.required &&
            item.source === candidate.source &&
            item.matchedBy === candidate.matchedBy
        )
    })
}

function areCategoryValuesEqual(previous: Record<string, boolean>, next: Record<string, boolean>) {
    const previousKeys = Object.keys(previous)
    const nextKeys = Object.keys(next)

    if (previousKeys.length !== nextKeys.length) {
        return false
    }

    return previousKeys.every((key) => previous[key] === next[key])
}

function areConsentStatesEqual(previous: CookieConsentState | null, next: CookieConsentState | null) {
    if (previous == null || next == null) {
        return previous === next
    }

    return (
        previous.version === next.version &&
        previous.decidedAt === next.decidedAt &&
        previous.source === next.source &&
        areCategoryValuesEqual(previous.categories, next.categories)
    )
}

function dispatchCookieConsentChange(state: CookieConsentState | null) {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') {
        return
    }

    window.dispatchEvent(
        new CustomEvent(HONEY_CONSENT_CHANGE_EVENT, {
            detail: {state},
        })
    )
}

export function CookieConsentProvider({
    children,
    version = '1',
    storageKey = COOKIE_CONSENT_STORAGE_KEY,
    persist = true,
    storage = COOKIE_CONSENT_STORAGE,
    cookieName = COOKIE_CONSENT_COOKIE_NAME,
    cookieMaxAgeDays = COOKIE_CONSENT_COOKIE_MAX_AGE_DAYS,
    categories: categoriesProp,
    declaration: declarationProp,
    defaultConsent,
    mode = 'opt-in',
    hideOnAccept = true,
    autoShow = true,
    reopenOnVersionChange = true,
    texts: textsOverride,
    loadDeclaration,
    loadConsent,
    saveConsent,
    requiredCookies = EMPTY_COOKIE_RULES,
    categoryRules = EMPTY_CATEGORY_RULES,
    onDetectedCookies,
    onConsentChange,
    onAcceptAll,
    onRejectAll,
    onWithdraw,
    sweepOnReject = true,
    onSweep,
}: CookieConsentProviderProps) {
    const texts = useMemo(() => mergeCookieConsentTexts(DEFAULT_HONEY_TEXTS, textsOverride), [textsOverride])
    const categories = useMemo(
        () => (categoriesProp && categoriesProp.length > 0 ? categoriesProp : createCookieConsentCategories(texts)),
        [categoriesProp, texts]
    )
    const categoriesRef = useRef(categories)
    const defaultConsentRef = useRef(defaultConsent)

    categoriesRef.current = categories
    defaultConsentRef.current = defaultConsent

    const [ready, setReady] = useState(false)
    const [state, setState] = useState<CookieConsentState | null>(null)
    const [bannerOpen, setBannerOpen] = useState(false)
    const [preferencesOpen, setPreferencesOpen] = useState(false)
    const [declaration, setDeclaration] = useState<CookieDeclarationItem[]>(
        declarationProp ?? createCookieConsentDeclaration()
    )
    const [inventory, setInventory] = useState(() => detectDocumentCookies({requiredCookies, categoryRules}))

    useEffect(() => {
        let mounted = true

        async function initializeDeclaration() {
            if (declarationProp) {
                setDeclaration(declarationProp)
                return
            }

            if (!loadDeclaration) {
                setDeclaration(createCookieConsentDeclaration())
                return
            }

            try {
                const items = await loadDeclaration()
                if (mounted) {
                    setDeclaration(items)
                }
            } catch {
                if (mounted) {
                    setDeclaration(createCookieConsentDeclaration())
                }
            }
        }

        void initializeDeclaration()

        return () => {
            mounted = false
        }
    }, [declarationProp, loadDeclaration])

    useEffect(() => {
        let mounted = true

        async function initialize() {
            if (mounted) {
                setReady(false)
            }

            let nextState: CookieConsentState | null = null

            if (loadConsent) {
                try {
                    nextState = await loadConsent()
                } catch {
                    nextState = null
                }
            }

            if (!nextState && persist) {
                nextState = readStoredCookieConsent({storage, storageKey, cookieName})
            }

            const current = isCurrentVersion(nextState, version)

            if (!mounted) {
                return
            }

            if (current && nextState) {
                const normalizedState: CookieConsentState = {
                    ...nextState,
                    categories: normalizeCategories(
                        categoriesRef.current,
                        nextState.categories,
                        defaultConsentRef.current
                    ),
                }

                setState((currentState) =>
                    areConsentStatesEqual(currentState, normalizedState) ? currentState : normalizedState
                )
                setBannerOpen((currentValue) => (currentValue ? false : currentValue))
            } else {
                const shouldOpenBanner = Boolean(autoShow && (!nextState || reopenOnVersionChange))

                setState((currentState) => (currentState == null ? currentState : null))
                setBannerOpen((currentValue) => (currentValue === shouldOpenBanner ? currentValue : shouldOpenBanner))
            }

            setReady(true)
        }

        void initialize()

        return () => {
            mounted = false
        }
    }, [autoShow, cookieName, loadConsent, persist, reopenOnVersionChange, storage, storageKey, version])

    useEffect(() => {
        setState((currentState) => {
            if (!currentState || currentState.version !== version) {
                return currentState
            }

            const nextCategories = normalizeCategories(categories, currentState.categories, defaultConsent)

            if (areCategoryValuesEqual(currentState.categories, nextCategories)) {
                return currentState
            }

            return {...currentState, categories: nextCategories}
        })
    }, [categories, defaultConsent, version])

    const refreshInventory = useCallback(() => {
        const nextInventory = detectDocumentCookies({requiredCookies, categoryRules})

        setInventory((current) => (areDetectedCookiesEqual(current, nextInventory) ? current : nextInventory))
        void onDetectedCookies?.(nextInventory)
    }, [categoryRules, onDetectedCookies, requiredCookies])

    useEffect(() => {
        refreshInventory()
    }, [refreshInventory, ready, state, preferencesOpen])

    const runSweep = useCallback(
        (nextCategories: Record<string, boolean>) => {
            if (!sweepOnReject) {
                return
            }

            const removed = sweepRejectedStorage({
                categories: nextCategories,
                requiredCookies,
                categoryRules,
                // Honey's own record is never in scope: wiping it would erase
                // the very decision that triggered the sweep.
                protectedNames: [storageKey, `${storageKey}-key`, cookieName],
            })

            if (removed.cookies.length || removed.localStorage.length || removed.sessionStorage.length) {
                onSweep?.(removed)
            }
        },
        [categoryRules, cookieName, onSweep, requiredCookies, storageKey, sweepOnReject]
    )

    const persistState = useCallback(
        async (nextState: CookieConsentState) => {
            setState(nextState)
            dispatchCookieConsentChange(nextState)

            if (persist) {
                writeStoredCookieConsent({storage, storageKey, cookieName, cookieMaxAgeDays}, nextState)
            }

            // After the decision is stored, so a sweep that throws cannot lose it.
            runSweep(nextState.categories)

            onConsentChange?.(nextState)

            if (saveConsent) {
                await saveConsent(nextState)
            }
        },
        [cookieMaxAgeDays, cookieName, onConsentChange, persist, runSweep, saveConsent, storage, storageKey]
    )

    const showBanner = useCallback(() => {
        setBannerOpen(true)
    }, [])

    const hideBanner = useCallback(() => {
        setBannerOpen(false)
    }, [])

    const openPreferences = useCallback(() => {
        setPreferencesOpen(true)
        setBannerOpen(false)
    }, [])

    const closePreferences = useCallback(() => {
        setPreferencesOpen(false)
        setBannerOpen((current) => current || state == null)
    }, [state])

    const acceptAll = useCallback(
        (source: CookieConsentSource = 'banner') => {
            const nextState = buildConsentState(
                version,
                source,
                categories,
                categories.reduce<Record<string, boolean>>((acc, category) => {
                    acc[category.key] = true
                    return acc
                }, {}),
                defaultConsent
            )

            void persistState(nextState)
            onAcceptAll?.(nextState)
            if (hideOnAccept) {
                setBannerOpen(false)
            }
            setPreferencesOpen(false)
        },
        [categories, defaultConsent, hideOnAccept, onAcceptAll, persistState, version]
    )

    const rejectAll = useCallback(
        (source: CookieConsentSource = 'banner') => {
            const nextState = buildConsentState(
                version,
                source,
                categories,
                categories.reduce<Record<string, boolean>>((acc, category) => {
                    acc[category.key] = category.required ?? false
                    return acc
                }, {}),
                defaultConsent
            )

            void persistState(nextState)
            onRejectAll?.(nextState)
            setBannerOpen(false)
            setPreferencesOpen(false)
        },
        [categories, defaultConsent, onRejectAll, persistState, version]
    )

    const savePreferences = useCallback(
        (next: Record<string, boolean>, source: CookieConsentSource = 'preferences') => {
            const nextState = buildConsentState(version, source, categories, next, defaultConsent)

            void persistState(nextState)
            setBannerOpen(false)
            setPreferencesOpen(false)
        },
        [categories, defaultConsent, persistState, version]
    )

    const withdrawConsent = useCallback(() => {
        if (persist) {
            clearStoredCookieConsent({storage, storageKey, cookieName})
        }

        runSweep(
            categoriesRef.current.reduce<Record<string, boolean>>((acc, category) => {
                acc[category.key] = Boolean(category.required)
                return acc
            }, {})
        )

        setState(null)
        dispatchCookieConsentChange(null)
        setPreferencesOpen(false)
        setBannerOpen(autoShow)
        onWithdraw?.()
    }, [autoShow, cookieName, onWithdraw, persist, runSweep, storage, storageKey])

    const hasConsent = useCallback(
        (category: string) => {
            const definition = categories.find((item) => item.key === category)
            if (definition?.required) {
                return true
            }

            return state?.categories?.[category] === true
        },
        [categories, state]
    )

    const isRequired = useCallback(
        (category: string) => categories.some((item) => item.key === category && item.required),
        [categories]
    )

    const pending = ready && state == null

    const contextValue = useMemo<CookieConsentContextValue>(
        () => ({
            ready,
            pending,
            bannerOpen,
            preferencesOpen,
            version,
            mode,
            state,
            texts,
            categories,
            declaration,
            inventory,
            hasConsent,
            isRequired,
            showBanner,
            hideBanner,
            openPreferences,
            closePreferences,
            acceptAll,
            rejectAll,
            savePreferences,
            withdrawConsent,
            setDeclaration,
            refreshInventory,
        }),
        [
            ready,
            pending,
            bannerOpen,
            preferencesOpen,
            version,
            mode,
            state,
            texts,
            categories,
            declaration,
            inventory,
            hasConsent,
            isRequired,
            showBanner,
            hideBanner,
            openPreferences,
            closePreferences,
            acceptAll,
            rejectAll,
            savePreferences,
            withdrawConsent,
            refreshInventory,
        ]
    )

    return <CookieConsentContextProvider value={contextValue}>{children}</CookieConsentContextProvider>
}
