import type {ButtonHTMLAttributes, MouseEvent, ReactNode} from 'react'
import type {HoneyColor} from '../../types'
import {useOptionalCookieConsent} from '../CookieConsentProvider/CookieConsentContext'
import {cn} from '../../utils/cn'

export type CookieTriggerVariant = 'link' | 'button' | 'ghost'

export interface CookieTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'children'> {
    /** Visual variant. `'link'` is the underline-on-hover footer style (default),
     *  `'button'` is a filled CTA, `'ghost'` is a quiet button without border. */
    variant?: CookieTriggerVariant
    /** Colour of the button variants and of the `'link'` text. On a link `'neutral'`
     *  takes the surrounding text colour, so it matches neighbouring footer links. */
    color?: HoneyColor
    /** Text shown inside the trigger. Falls back to `texts.triggerLabel` from
     *  the provider (defaults to "Cookie settings"). */
    label?: ReactNode
    children?: ReactNode
}

/**
 * "Cookie settings" link/button you can drop in a footer or settings page. On
 * click, opens the preferences drawer of the surrounding `CookieConsentProvider`.
 * Consumers that wrap the click handler can call `event.preventDefault()` to
 * suppress the default open behaviour (e.g. when navigating to a custom URL).
 */
export function CookieTrigger({
    variant = 'link',
    color = 'primary',
    label,
    children,
    className,
    onClick,
    type,
    ...rest
}: CookieTriggerProps) {
    const consent = useOptionalCookieConsent()
    const content = children ?? label ?? consent?.texts.triggerLabel ?? 'Cookie settings'

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
            consent?.openPreferences()
        }
    }

    if (variant === 'link') {
        return (
            <button
                type={type ?? 'button'}
                className={cn('honey-link', 'honey-cookie-trigger-link', `honey-link-color-${color}`, className)}
                onClick={handleClick}
                {...rest}
            >
                {content}
            </button>
        )
    }

    const buttonVariant = variant === 'button' ? 'honey-btn-filled' : 'honey-btn-ghost'

    return (
        <button
            type={type ?? 'button'}
            className={cn('honey-btn', buttonVariant, `honey-btn-color-${color}`, className)}
            onClick={handleClick}
            {...rest}
        >
            {content}
        </button>
    )
}
