// Public surface for @banzamel/honey 0.7.0 (Phase 3 — licensing wiring is in.
// The package CLI / postinstall / activation runtime register installs with
// the Honey licensing backend at api.mineralui.io. Cookie consent UI keeps
// working without activation — only backend premium features (audit logging,
// cross-domain consent sharing, server-side scan reports) require a registered
// install. Components and bootstrap shipped in Phase 2.1-2.5 are unchanged.)

// Token + primitive CSS — side-effect imports so consumers get styles
// automatically the first time they import anything from @banzamel/honey.
import './tokens.css'
import './primitives.css'
// Component-specific layout (only the rules each component adds on top of
// the shared primitives). Tree-shaking cannot drop CSS, so we import here
// to keep all paint rules in one bundle.
import './components/CookieBanner/CookieBanner.css'
import './components/CookieTrigger/CookieTrigger.css'
import './components/CookiePreferences/CookiePreferences.css'
import './components/CookieDeclaration/CookieDeclaration.css'
import './components/CookieConsent/CookieConsent.css'

// Provider, context, persistence, inventory, defaults
export {
    CookieConsentProvider,
    useCookieConsent,
    useOptionalCookieConsent,
    CookieConsentContextProvider,
    HONEY_CONSENT_CHANGE_EVENT,
    COOKIE_CONSENT_COOKIE_MAX_AGE_DAYS,
    COOKIE_CONSENT_COOKIE_NAME,
    COOKIE_CONSENT_STORAGE,
    COOKIE_CONSENT_STORAGE_KEY,
    DEFAULT_HONEY_TEXTS,
    createCookieConsentCategories,
    createCookieConsentDeclaration,
    mergeCookieConsentTexts,
    clearStoredCookieConsent,
    readStoredCookieConsent,
    writeStoredCookieConsent,
    detectDocumentCookies,
    classifyStorageEntry,
    sweepRejectedStorage,
} from './components/CookieConsentProvider'
export type {
    CookieConsentProviderProps,
    CookieConsentContextValue,
    CookieConsentSweepOptions,
    CookieConsentSweepResult,
    HoneyConsentChangeEventDetail,
} from './components/CookieConsentProvider'

// Bootstrap (cookie-blocking script + scan/report helpers + runtime factory)
export {
    autoBootstrapCookieConsent,
    bootstrapCookieConsent,
    readCookieBootstrapConfig,
    reportCookieSurface,
    scanCookieSurface,
    createHoneyCookieRuntime,
    initializeCookieConsentBootstrapScript,
    resolveCookieBootstrapConfigFromScript,
    HONEY_COOKIE_BOOTSTRAP_CONFIG_KEY,
    HONEY_COOKIE_RUNTIME_KEY,
    HONEY_COOKIE_RUNTIME_READY_EVENT,
} from './components/CookieBootstrap'
export type {
    CookieBootstrapConfig,
    CookieBootstrapHandle,
    CookieBootstrapResourceKind,
    CookieBootstrapResourceRules,
    CookieBootstrapScanOptions,
    CookieScanCookieItem,
    CookieScanReport,
    CookieScanResourceItem,
    CookieScanStorageItem,
    HoneyCookieRuntime,
} from './components/CookieBootstrap'

// UI components
export {CookieBanner} from './components/CookieBanner'
export type {CookieBannerProps, CookieBannerPosition, CookieBannerVariant} from './components/CookieBanner'

export {CookieTrigger} from './components/CookieTrigger'
export type {CookieTriggerProps, CookieTriggerVariant} from './components/CookieTrigger'

export {CookiePreferences} from './components/CookiePreferences'
export type {CookiePreferencesProps, CookiePreferencesVariant} from './components/CookiePreferences'

export {CookieDeclaration} from './components/CookieDeclaration'
export type {CookieDeclarationProps} from './components/CookieDeclaration'

export {CookieConsent} from './components/CookieConsent'
export type {
    CookieConsentProps,
    CookieConsentPlacement,
    CookieConsentTriggerPlacement,
    CookieConsentTriggerVariant,
    CookieConsentTriggerShape,
} from './components/CookieConsent'

// Drop-in wrapper combining provider + banner + preferences drawer (and
// optionally the footer trigger). Lets consumers wire a compliant surface
// with a single component.
export {HoneySetup} from './components/HoneySetup'
export type {HoneySetupProps} from './components/HoneySetup'

// Shared types
export type {
    HoneyColor,
    CookieConsentCategory,
    CookieConsentSource,
    CookieConsentMode,
    CookieConsentPersistence,
    CookieMatchRule,
    CookieCategoryDefinition,
    CookieCategoryRules,
    CookieDeclarationItem,
    CookieStorageType,
    CookieConsentState,
    DetectedCookie,
    DetectedCookieSource,
    DetectedCookieMatch,
    HoneyCookieConsentTexts,
    // Deprecated aliases — to be removed once consumers migrate
    HoneyCookieCategory,
    HoneyConsentState,
} from './types'

// Utilities
export {cn} from './utils/cn'

// Activation / licensing — read whether this install is registered with the
// Honey licensing backend so consumers can render their own admin chip.
export {isHoneyActivated, getHoneyActivationState} from './activation'
export type {HoneyActivationState} from './activation'
